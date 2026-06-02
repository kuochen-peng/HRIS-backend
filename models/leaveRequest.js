/**
 * 請假申請資料模型 (LeaveRequest Model)
 *
 * 記錄員工的每一筆請假申請，包含：
 * - 關聯的申請人（ref to users）
 * - 假別（特休、病假、事假、補休）
 * - 請假日期與起迄時間
 * - 請假總時數（前端計算後送入，方便統計扣除）
 * - 附件（上傳至 Cloudinary 後儲存圖片/文件 URL）
 * - 審核狀態（待審核 → 已同意 / 已駁回 / 已撤銷）
 * - 審核人（ref to users）與審核意見
 *
 * 設計說明：
 * - date 僅記錄請假「日期」（用於日曆顯示）；
 *   startTime / endTime 記錄完整時間戳，用於計算時數與顯示期間
 * - totalHours 由前端計算後傳入，後端直接儲存；
 *   補休扣除邏輯在 updateStatus controller 中根據此欄位計算
 * - attachment 存 Cloudinary URL（字串），不存實際檔案內容，
 *   減少 DB 儲存量並利用 CDN 加速圖片載入
 * - approver 在審核時才寫入，方便追蹤是誰審核的
 */

import { Schema, model } from 'mongoose'

const schema = new Schema({
	// 申請人：關聯 users 集合
	user: {
		type: Schema.Types.ObjectId,
		ref: 'users',
	},
	// 假別：決定扣哪種假期額度
	// 特休、病假、事假 → 法規定義的上限，由前端顯示剩餘量
	// 補休 → 從使用者的 leaveQuota.compLeave 扣除
	leaveType: {
		type: String,
		enum: ['特休', '病假', '事假', '補休'],
	},
	// 請假日期（用於日曆標記與按日期查詢）
	date: {
		type: Date,
	},
	// 請假開始時間（完整時間戳，例如 2024-03-15T09:00:00）
	startTime: {
		type: Date,
	},
	// 請假結束時間（完整時間戳，例如 2024-03-15T12:00:00）
	endTime: {
		type: Date,
	},
	// 請假總時數（小時）：由前端根據 startTime ~ endTime 計算
	// 補休審核通過時，此數值用來換算成「天數」扣除 compLeave
	totalHours: {
		type: Number,
	},
	// 附件 URL（上傳到 Cloudinary 後得到的公開 URL）
	// 用於病假、就診證明等需要檢附文件的假別
	attachment: {
		type: String,
	},
	// 審核狀態，流程：待審核 → 已同意 / 已駁回，或申請人主動撤銷 → 已撤銷
	status: {
		type: String,
		enum: ['待審核', '已同意', '已駁回', '已撤銷'],
	},
	// 審核人：由 admin/manager 審核時，自動寫入當前使用者 ID
	approver: {
		type: Schema.Types.ObjectId,
		ref: 'users',
	},
	// 審核意見：審核人可選填，用於說明駁回原因或補充說明
	comment: {
		type: String,
	},
},
{
	versionKey: false,  // 關閉 __v 版本號
	timestamps: true,   // 自動加入 createdAt、updatedAt
})

// 集合名稱為 'leaveRequests'
export default model('leaveRequests', schema)
