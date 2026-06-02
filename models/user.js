/**
 * 使用者資料模型 (User Model)
 *
 * 定義系統中「員工 / 管理者」的資料結構與商業規則，包含：
 * - 帳號、密碼的格式驗證
 * - 密碼儲存前自動 hash（bcrypt），防止明文洩漏
 * - JWT token 清單管理（最多保留 5 組，超過自動踢出最舊的）
 * - 員工資料：姓名、信箱、部門、到職日
 * - 工作時間設定：上班時間、下班時間（用於打卡狀態判斷）
 * - 假期額度：補休天數（特休、病假、事假由程式動態計算，不存 DB）
 *
 * 為什麼密碼要在 pre('save') 中 hash：
 *   將 hash 邏輯放在 Model 中，確保無論從哪裡呼叫 save()，
 *   密碼都一定會被加密，避免遺漏。
 *
 * 為什麼 tokens 保留最多 5 組：
 *   允許使用者在多個裝置同時登入，但限制數量避免 DB 無限膨脹。
 *   超過 5 個時移除最舊的，相當於自動登出最久沒用的裝置。
 */

import { Schema, Error, model } from 'mongoose'
import validator from 'validator'
import bcrypt from 'bcrypt'

const schema = new Schema(
	{
		// 登入帳號：4~20 英數字，唯一值
		// unique: true 會在 MongoDB 建立唯一索引
		// trim: true 自動去除頭尾空白，避免輸入空白導致帳號重複問題
		account: {
			type: String,
			required: [true, '帳號必填'],
			minlength: [4, '最少 4 個字'],
			maxlength: [20, '最多 20 個字'],
			unique: true,
			trim: true,
			validate: {
				validator(value) {
					// 使用 validator 函式庫確保帳號只含英文字母與數字
					return validator.isAlphanumeric(value)
				},
				message: '帳號只能是英數字',
			},
		},
		// 密碼：儲存前會在 pre('save') hook 中自動 hash，此欄位只存 hash 後的字串
		password: {
			type: String,
			required: [true, '密碼必填'],
		},
		// 角色權限：決定使用者可以存取哪些功能
		// admin    → 人員管理、審核假單、查看所有資料
		// manager  → 審核假單、查看所有假單
		// employee → 只能操作自己的出勤與假單
		role: {
			type: String,
			enum: ['admin', 'manager', 'employee'],
			default: 'employee',
		},
		// 已登入的 JWT token 清單（實作多裝置登入）
		// 每次登入產生新 token 並存入此陣列，登出時移除對應 token
		// JWT 驗證時會比對 token 是否在此清單中，若不在則視為無效（實作登出功能）
		tokens: {
			type: [String],
		},
		// 員工基本資料
		name: {
			type: String,
		},
		email: {
			type: String,
		},
		department: {
			type: String,
		},
		// 到職日：用於計算法定年資特休天數
		onboardDate: {
			type: Date,
		},
		// 假期額度：只存補休，其他假別由前端依法規動態計算
		leaveQuota: {
			// 補休天數：由管理員手動調整（例如加班換補休）
			compLeave: { type: Number, default: 0 },
		},
		// 工作時間設定：用於打卡狀態判斷（是否遲到/早退）
		work: {
			workStartTime: {
				type: String,
				default: '09:00', // 預設上班時間 09:00
			},
			workEndTime: {
				type: String,
				default: '18:00', // 預設下班時間 18:00
			},
		},
	},
	{
		versionKey: false,  // 關閉 Mongoose 預設的 __v 版本號欄位
		timestamps: true,   // 自動新增 createdAt、updatedAt 欄位
	},
)

/**
 * pre('save') hook：在儲存文件前自動執行
 *
 * 為什麼需要這個 hook：
 * 1. 密碼 hash：每次修改密碼才重新 hash，不影響其他欄位的 save 效能
 * 2. token 數量限制：新增 token 時自動踢出最舊的，維持最多 5 組
 */
schema.pre('save', async function () {
	const user = this

	// 只有密碼被修改時才重新 hash（避免每次 save 都重複 hash 已 hash 的值）
	if (user.isModified('password')) {
		let message = ''
		// 在 hash 前做格式驗證，因為 hash 後字串長度固定，放在 schema 的 minlength 規則無效
		if (user.password.length < 4) {
			message = '最少 4 個字'
		} else if (user.password.length > 20) {
			message = '最多 20 個字'
		} else if (!validator.isAscii(user.password)) {
			message = '密碼只能是英、數字、特殊符號'
		}

		if (message !== '') {
			// 拋出 Mongoose ValidationError，讓 controller 的 catch 能統一處理
			const error = new Error.ValidationError()
			error.addError('password', new Error.ValidatorError({ message, path: 'password' }))
			throw error
		}

		// bcrypt hash 密碼，salt rounds = 10（安全與效能的平衡點）
		user.password = bcrypt.hashSync(user.password, 10)
	}

	// 當 tokens 陣列被修改且超過 5 個時，移除最舊的（index 0）
	// 達到「最多 5 裝置同時登入」的效果
	if (user.isModified('tokens') && user.tokens.length > 5) {
		user.tokens.shift()
	}
})

// 將 schema 編譯成 Model 並匯出，集合名稱為 'users'
export default model('users', schema)
