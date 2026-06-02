/**
 * 出勤紀錄資料模型 (Attendance Model)
 *
 * 記錄每位員工每天的打卡資訊，包含：
 * - 關聯的使用者 (ref to users collection)
 * - 當日日期（設為當天 00:00:00，用於查詢「今天是否已打卡」）
 * - 上班打卡時間（checkIn）
 * - 下班打卡時間（checkOut，初始不存在，下班後才寫入）
 * - 出勤狀態（正常 / 遲到 / 早退 / 曠職）
 *
 * 設計說明：
 * - date 欄位固定設為當日 00:00:00，方便用範圍查詢（$gte today, $lt tomorrow）
 *   確認某天是否已有打卡紀錄，而不依賴 checkIn 的時間部分
 * - checkOut 不設 required，因為上班打卡時還沒有下班時間；
 *   查詢「尚未下班」時用 { checkOut: { $exists: false } } 判斷
 * - status 由 controller 在打卡當下根據時間自動判斷並寫入
 */

import { Schema, model } from 'mongoose'

const schema = new Schema({
	// 關聯到 users 集合的使用者 ID
	// ref: 'users' 讓 Mongoose populate() 能自動帶入使用者資料
	user: {
		type: Schema.Types.ObjectId,
		ref: 'users',
	},
	// 打卡當日的日期（時間固定為 00:00:00）
	// 用途：判斷某天是否已有打卡紀錄（透過範圍查詢）
	date: {
		type: Date,
	},
	// 上班打卡的完整時間戳記（含時分秒）
	// 用途：計算遲到時間、顯示打卡時刻
	checkIn: {
		type: Date,
	},
	// 下班打卡的完整時間戳記（下班後才寫入，初始不存在）
	// 不存在表示當天尚未下班，查詢時用 $exists: false 判斷
	checkOut: {
		type: Date,
	},
	// 出勤狀態，由系統根據打卡時間自動判斷：
	// 正常      → 上班打卡在上班時間前（或當下），且下班打卡在下班時間後
	// 遲到      → 上班打卡時間 > 上班時間，且在中午 12:00 前
	// 早退      → 下班打卡時間 < 下班時間
	// 曠職/缺勤 → 上班打卡時間超過中午 12:00
	status: {
		type: String,
		enum: ['正常', '遲到', '早退', '曠職 / 缺勤'],
	},
},
{
	versionKey: false,  // 關閉 __v 版本號
	timestamps: true,   // 自動加入 createdAt、updatedAt
})

// 集合名稱為 'attendances'
export default model('attendances', schema)
