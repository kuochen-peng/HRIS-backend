/**
 * 出勤控制器 (Attendance Controller)
 *
 * 處理員工的打卡業務邏輯，包含：
 * - checkIn     → 上班打卡（每天只能打一次，並自動判斷出勤狀態）
 * - checkOut    → 下班打卡（當天未打過下班才能操作，自動判斷早退）
 * - getAttendance → 取得當前登入者的所有出勤紀錄
 *
 * 時間處理說明：
 * 所有時間比較都先轉換為台北時區的 HH:mm 字串再做字串比較，
 * 這樣不需要處理時區轉換的複雜度，直接用字典序比較大小。
 * （例如 '09:30' > '09:00' 為 true，符合直覺）
 *
 * 出勤狀態判斷邏輯：
 * - 上班打卡時間 <= 上班時間               → 正常
 * - 上班時間 < 打卡時間 < 12:00            → 遲到
 * - 打卡時間 >= 12:00                     → 曠職 / 缺勤
 * - 下班打卡時間 < 下班時間（且原本正常/遲到）→ 早退
 */

import Attendance from '../models/attendance.js'
import { StatusCodes } from 'http-status-codes'

/**
 * 上班打卡
 * 路由：POST /attendance/checkIn（需要有效 token）
 *
 * 流程：
 * 1. 計算今天的時間範圍（00:00 ~ 次日 00:00）
 * 2. 查詢今天是否已有打卡紀錄，防止重複打卡
 * 3. 取得當前台北時間並與使用者設定的上班時間比較，判斷狀態
 * 4. 建立出勤紀錄
 */
export const checkIn = async (req, res) => {
	try {
		// 計算今天的起點（00:00:00）
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		// 計算明天的起點，作為查詢範圍的上界（$lt tomorrow 等同於 <= today 23:59:59）
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// 查詢今天是否已有打卡紀錄（date 欄位存的是當日 00:00:00，用範圍查詢）
		const attendance = await Attendance.findOne({
			user: req.user._id,
			date: { $gte: today, $lt: tomorrow },
		})

		// 已打過卡就拒絕（每天只能打一次上班卡）
		if (attendance) {
			return res.status(StatusCodes.BAD_REQUEST).json({ message: '今天已打卡' })
		}

		// 取得目前台北時間的 HH:mm 格式（用於與上班時間做字串比較）
		const now = new Date()
		const currentHHMM = now.toLocaleTimeString('en-US', {
			timeZone: 'Asia/Taipei',
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
		})

		// 取使用者設定的上班時間（預設 09:00）
		const workStartTime = req.user.work?.workStartTime || '09:00'

		// 根據打卡時間判斷出勤狀態
		let status = '正常'
		if (currentHHMM > '12:00') {
			// 超過中午 12 點才打卡，視為曠職
			status = '曠職 / 缺勤'
		} else if (currentHHMM > workStartTime) {
			// 超過上班時間但在中午前，視為遲到
			status = '遲到'
		}

		// 建立出勤紀錄
		// date 固定為當日 00:00:00（方便後續的範圍查詢）
		// checkIn 為實際打卡的完整時間戳記
		const result = await Attendance.create({
			user: req.user._id,
			date: today,
			checkIn: now,
			status,
		})

		res.status(StatusCodes.OK).json({ result })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 下班打卡
 * 路由：PATCH /attendance/checkOut（需要有效 token）
 *
 * 流程：
 * 1. 查詢今天「已打上班卡但尚未打下班卡」的紀錄
 * 2. 比較當前時間與設定的下班時間，判斷是否為早退
 * 3. 寫入下班時間
 *
 * 狀態變更規則：
 * - 若下班時間早於設定的下班時間，且原本狀態是「正常」或「遲到」，則改為「早退」
 * - 曠職狀態不會因為下班打卡而改變
 */
export const checkOut = async (req, res) => {
	try {
		const now = new Date()

		// 計算今天的時間範圍（與 checkIn 相同邏輯）
		const today = new Date()
		today.setHours(0, 0, 0, 0)
		const tomorrow = new Date(today)
		tomorrow.setDate(tomorrow.getDate() + 1)

		// 取使用者設定的下班時間（預設 18:00）
		const workEndTime = req.user.work?.workEndTime || '18:00'

		// 取得當前台北時間的 HH:mm 格式
		const currentHHMM = now.toLocaleTimeString('en-US', {
			timeZone: 'Asia/Taipei',
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
		})

		// 查詢今天「已打上班卡但尚未打下班卡」的紀錄
		// checkOut: { $exists: false } 表示 checkOut 欄位不存在（尚未下班）
		const attendance = await Attendance.findOne({
			user: req.user._id,
			date: { $gte: today, $lt: tomorrow },
			checkOut: { $exists: false },
		})

		// 找不到符合條件的紀錄：可能今天沒打上班卡，或已經打過下班卡
		if (!attendance) {
			return res.status(StatusCodes.NOT_FOUND).json({ message: '找不到打卡紀錄或已下班' })
		}

		// 若下班時間早於設定的下班時間，且原本不是曠職，改為早退
		if (currentHHMM < workEndTime) {
			if (attendance.status === '正常' || attendance.status === '遲到') {
				attendance.status = '早退'
			}
		}

		// 寫入下班打卡時間
		attendance.checkOut = now
		await attendance.save()

		res.status(StatusCodes.OK).json({ result: attendance })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 取得個人出勤紀錄
 * 路由：GET /attendance/attendance（需要有效 token）
 *
 * 只回傳當前登入者自己的出勤紀錄，按日期降冪排列（最新的排最前）。
 * 前端用來渲染出勤日曆與打卡紀錄表格。
 */
export const getAttendance = async (req, res) => {
	try {
		// 只查詢自己的紀錄（user: req.user._id），不會取到其他員工的資料
		const result = await Attendance.find({ user: req.user._id }).sort({ date: -1 })
		res.status(StatusCodes.OK).json({ result })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}
