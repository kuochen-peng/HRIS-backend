/**
 * 使用者控制器 (User Controller)
 *
 * 處理所有與「使用者帳號」相關的業務邏輯，包含：
 * - create     → 新增員工帳號（只有 admin 可操作）
 * - login      → 登入，產生 JWT token
 * - profile    → 取得當前登入者的個人資料
 * - refresh    → 刷新 JWT token（舊 token 換新 token）
 * - logout     → 登出，從 token 清單中移除此 token
 * - getUser    → 取得所有使用者列表（admin 用於人員管理）
 * - updateUser → 更新指定使用者的資料（admin 操作）
 *
 * 每個函式都遵循相同模式：
 * try → 執行業務邏輯 → 回傳成功 JSON
 * catch → 判斷錯誤類型 → 回傳對應 HTTP 狀態碼與訊息
 */

import User from '../models/user.js'
import { StatusCodes } from 'http-status-codes'
import jwt from 'jsonwebtoken'
import validator from 'validator'

/**
 * 新增使用者帳號
 * 路由：POST /user（需要 admin 權限）
 *
 * 接收 req.body 中的帳號密碼資料，建立新的 User 文件。
 * 密碼 hash 在 User model 的 pre('save') hook 中自動處理。
 *
 * 錯誤處理：
 * - ValidationError → 400 Bad Request（欄位格式錯誤，回傳第一個錯誤訊息）
 * - MongoServerError code 11000 → 409 Conflict（帳號重複，unique 索引衝突）
 * - 其他 → 500 Internal Server Error
 */
export const create = async (req, res) => {
	try {
		const result = new User(req.body)
		await result.save()
		// 回傳最少必要的資訊，不回傳密碼 hash 或 token 清單
		res.status(StatusCodes.CREATED).json({
			result: {
				account: result.account,
				role: result.role,
			},
		})
	} catch (error) {
		if (error.name === 'ValidationError') {
			// 取第一個驗證錯誤的訊息回傳（例如「帳號只能是英數字」）
			const key = Object.keys(error.errors)[0]
			const message = error.errors[key].message
			res.status(StatusCodes.BAD_REQUEST).json({
				message,
			})
		} else if (error.name === 'MongoServerError' && error.code === 11000) {
			// MongoDB unique 索引衝突：帳號已存在
			res.status(StatusCodes.CONFLICT).json({
				message: '帳號重複',
			})
		} else {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				message: '伺服器錯誤',
			})
		}
	}
}

/**
 * 使用者登入
 * 路由：POST /user/login（由 auth.login 中間件做帳密驗證，成功後才進此 controller）
 *
 * 在 auth.login 中間件驗證帳密成功後，req.user 已包含使用者資料。
 * 此 controller 負責：
 * 1. 產生新的 JWT token（有效期 1 天）
 * 2. 將 token 加入使用者的 tokens 清單（多裝置登入管理）
 * 3. 回傳使用者資料與 token 給前端
 *
 * 為什麼 token 要存在 DB：
 * JWT 本身無狀態，一旦發出就無法撤銷，除非有伺服器端的 token 清單。
 * 登出時從清單移除 token，之後的請求即使帶相同 token 也會驗證失敗。
 */
export const login = async (req, res) => {
	try {
		// 用使用者 _id 簽發 JWT，有效期 1 天
		const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, {
			expiresIn: '1 days',
		})
		// 將 token 加入清單（pre('save') hook 會確保最多 5 個）
		req.user.tokens.push(token)
		await req.user.save()
		// 回傳完整使用者資料，前端用來填充 Pinia store
		res.status(StatusCodes.OK).json({
			result: {
				_id: req.user._id,
				account: req.user.account,
				role: req.user.role,
				name: req.user.name,
				email: req.user.email,
				department: req.user.department,
				onboardDate: req.user.onboardDate,
				work: req.user.work,
				leaveQuota: req.user.leaveQuota,
				token, // 前端需要這個 token 存入 localStorage 以供後續請求使用
			},
		})
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
			message: '伺服器錯誤',
		})
	}
}

/**
 * 取得個人資料
 * 路由：GET /user/profile（需要有效 token）
 *
 * req.user 由 auth.token 中間件從 DB 查詢並掛載，此 controller 直接取用即可。
 * 使用場景：頁面重整後，前端用存在 localStorage 的 token 重新取得使用者資料。
 *
 * 故意不回傳 tokens 清單與密碼，只回傳必要的顯示資料。
 */
export const profile = async (req, res) => {
	res.status(StatusCodes.OK).json({
		result: {
			_id: req.user._id,
			account: req.user.account,
			role: req.user.role,
			name: req.user.name,
			email: req.user.email,
			department: req.user.department,
			onboardDate: req.user.onboardDate,
			work: req.user.work,
			leaveQuota: req.user.leaveQuota,
		},
	})
}

/**
 * 刷新 JWT Token
 * 路由：PATCH /user/refresh（允許過期 token 存取，見 passport.js 設定）
 *
 * 當前端偵測到 API 回傳 401 Unauthorized 時，自動呼叫此端點換取新 token。
 * 流程：找到舊 token 在清單中的位置 → 用新 token 替換 → 回傳新 token。
 *
 * 為什麼用替換而非新增：保持 tokens 清單的長度不變（同一裝置不佔多個位置）。
 */
export const refresh = async (req, res) => {
	try {
		// 找到當前 token 在清單中的索引
		const i = req.user.tokens.indexOf(req.token)
		// 簽發新 token，有效期重設為 1 天
		const token = jwt.sign({ _id: req.user._id }, process.env.JWT_SECRET, {
			expiresIn: '1 days',
		})
		// 用新 token 替換舊的（in-place 替換，不改變清單長度）
		req.user.tokens[i] = token
		await req.user.save()
		res.status(StatusCodes.OK).json({
			result: {
				token,
			},
		})
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
			message: '伺服器錯誤',
		})
	}
}

/**
 * 登出
 * 路由：DELETE /user/logout（允許過期 token 存取）
 *
 * 從使用者的 tokens 清單中移除目前這個 token。
 * 之後即使客戶端還持有相同 token，JWT 驗證時查不到 token 就會失敗（見 passport.js）。
 */
export const logout = async (req, res) => {
	try {
		// 找到當前 token 的索引並移除
		const i = req.user.tokens.indexOf(req.token)
		req.user.tokens.splice(i, 1)
		await req.user.save()
		res.status(StatusCodes.OK).json({
			result: {},
		})
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
			message: '伺服器錯誤',
		})
	}
}

/**
 * 取得所有使用者列表
 * 路由：GET /user/getUser（需要 admin 權限）
 *
 * 回傳所有員工資料，按建立時間降冪排列（最新加入的排最前）。
 * 供 admin 在人員管理頁面查看和編輯員工資料。
 */
export const getUser = async (req, res) => {
	try {
		// sort({ createdAt: -1 }) 讓最新加入的員工排最前面
		const result = await User.find().sort({ createdAt: -1 })
		res.status(StatusCodes.OK).json({
			result,
		})
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 更新使用者資料
 * 路由：PATCH /user/updateUser/:id（需要 admin 權限）
 *
 * 更新指定員工的個人資料，包括姓名、信箱、部門、到職日、角色、工作時間與補休天數。
 * 採用「只更新有傳入的欄位」的策略（逐欄位 || 原值），避免誤清空未傳的欄位。
 *
 * 特別處理：
 * - 先驗證 :id 是否為合法的 MongoDB ObjectId，避免非法格式打 DB
 * - leaveQuota.compLeave 用 ?? 而非 ||，因為 0 是合法值（|| 會把 0 當 falsy）
 *
 * 錯誤處理：
 * - ID 無效或找不到使用者 → 404 Not Found
 * - 其他 → 500 Internal Server Error
 */
export const updateUser = async (req, res) => {
	try {
		// 先驗證 ID 格式，不合法直接丟錯，避免無效查詢打到 DB
		if (!validator.isMongoId(req.params.id)) {
			throw new Error('ID')
		}

		// orFail(new Error('ID'))：找不到文件時直接拋出自訂錯誤，統一由 catch 處理
		const result = await User.findById(req.params.id).orFail(new Error('ID'))

		// 逐欄位更新，只有傳入才覆蓋（|| 讓未傳的欄位保留原值）
		result.name = req.body.name || result.name
		result.email = req.body.email || result.email
		result.role = req.body.role || result.role
		result.department = req.body.department || result.department
		result.onboardDate = req.body.onboardDate || result.onboardDate

		// 工作時間是巢狀物件，需要先確認 req.body.work 存在才更新
		if (req.body.work) {
			result.work.workStartTime = req.body.work.workStartTime || result.work.workStartTime
			result.work.workEndTime = req.body.work.workEndTime || result.work.workEndTime
		}

		// 補休天數用 ?? 而非 ||，因為 0 天是合法值
		if (req.body.leaveQuota) {
			result.leaveQuota.compLeave = req.body.leaveQuota.compLeave ?? result.leaveQuota.compLeave
		}

		await result.save()
		res.status(StatusCodes.OK).json({
			result,
		})
	} catch (error) {
		console.log(error)
		if (error.message === 'ID') {
			res.status(StatusCodes.NOT_FOUND).json({
				message: '找不到 ID',
			})
		} else {
			res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
		}
	}
}
