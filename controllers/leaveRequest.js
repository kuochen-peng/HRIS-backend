/**
 * 請假申請控制器 (LeaveRequest Controller)
 *
 * 處理請假申請的完整生命週期：
 * - create           → 員工建立新的請假申請
 * - getAllLeaveRequest → 管理者取得所有員工的申請（審核用）
 * - getMyLeaveRequest  → 員工取得自己的申請紀錄
 * - updateStatus      → 審核人同意/駁回，或撤銷申請（含補休額度扣除/回補邏輯）
 *
 * 補休邏輯說明：
 * 當假別為「補休」且審核狀態改變時，需要同步調整員工的 leaveQuota.compLeave：
 * - 非同意 → 已同意：扣除補休天數（申請成立）
 * - 已同意 → 非同意（駁回/撤銷）：回補補休天數（申請取消）
 * 這樣確保補休餘額始終與實際申請狀態一致。
 */

import LeaveRequest from '../models/leaveRequest.js'
import User from '../models/user.js'
import { StatusCodes } from 'http-status-codes'

/**
 * 建立請假申請
 * 路由：POST /leaveRequest（需要有效 token，可附上傳附件）
 *
 * 從 req.body 取得請假資料，req.file 取得附件 URL（上傳後由 multer 提供）。
 * 初始狀態固定為「待審核」，申請人為當前登入者。
 *
 * req.file?.path：Cloudinary 上傳後的公開 URL，
 * 若沒有附件則 req.file 為 undefined，用 || '' 給空字串
 */
export const create = async (req, res) => {
	try {
		const result = await LeaveRequest.create({
			...req.body,
			user: req.user._id,      // 申請人為當前登入者
			status: '待審核',          // 初始狀態固定為待審核，避免前端偽造狀態
			attachment: req.file?.path || '', // 附件 URL（無附件則空字串）
		})
		res.status(StatusCodes.OK).json({ result })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 取得所有請假申請（管理者用）
 * 路由：GET /leaveRequest/all（需要 manager 或 admin 權限）
 *
 * 回傳系統中所有員工的請假申請，按開始時間降冪排列。
 * populate('user', 'name')：將 user 欄位的 ObjectId 替換為使用者的 name，
 * 讓前端直接顯示申請人姓名而不需要額外查詢。
 */
export const getAllLeaveRequest = async (req, res) => {
	try {
		const result = await LeaveRequest.find().populate('user', 'name').sort({ startTime: -1 })
		res.status(StatusCodes.OK).json({ result })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 取得自己的請假申請
 * 路由：GET /leaveRequest/my（需要有效 token）
 *
 * 只回傳當前登入者自己的申請，按開始時間降冪排列。
 * 員工在個人出勤頁面查看自己的請假歷史紀錄時使用。
 */
export const getMyLeaveRequest = async (req, res) => {
	try {
		const result = await LeaveRequest.find({ user: req.user._id }).populate('user', 'name').sort({ startTime: -1 })
		res.status(StatusCodes.OK).json({ result })
	} catch (error) {
		console.log(error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤' })
	}
}

/**
 * 更新請假申請狀態（審核 / 撤銷）
 * 路由：PATCH /leaveRequest/:id（需要有效 token）
 *
 * 此函式處理兩種使用情境：
 * 1. 管理者審核：待審核 → 已同意 / 已駁回
 * 2. 撤銷申請：任何狀態 → 已撤銷（申請人或管理者皆可）
 *
 * 補休額度同步邏輯：
 * 當假別為「補休」且狀態從非同意改為同意（或反向），需要調整 leaveQuota.compLeave。
 * totalHours / 8 將時數換算為天數（假設每天 8 小時）。
 *
 * 為什麼在這裡處理補休而非 create 時扣除：
 * 申請建立時狀態為「待審核」，補休額度應在「審核通過」後才扣除；
 * 若在申請時立即扣除，駁回後還需回補，邏輯更複雜且容易出錯。
 */
export const updateStatus = async (req, res) => {
	try {
		// 查詢申請是否存在
		const result = await LeaveRequest.findById(req.params.id)
		if (!result) {
			return res.status(StatusCodes.NOT_FOUND).json({ message: '找不到請假申請' })
		}

		const oldStatus = result.status
		const newStatus = req.body.status

		// 補休額度調整邏輯：只在假別為「補休」且狀態有變化時觸發
		if (result.leaveType === '補休' && oldStatus !== newStatus) {
			const user = await User.findById(result.user)
			if (user) {
				// 將時數換算為天數（8 小時 = 1 天）
				const hours = result.totalHours || 0
				const days = hours / 8

				if (oldStatus !== '已同意' && newStatus === '已同意') {
					// 申請從「非同意」→「已同意」：扣除補休額度
					user.leaveQuota.compLeave -= days
				} else if (oldStatus === '已同意' && newStatus !== '已同意') {
					// 申請從「已同意」→「非同意（駁回/撤銷）」：回補補休額度
					user.leaveQuota.compLeave += days
				}
				await user.save()
			}
		}

		// 更新申請狀態、審核人與審核意見
		result.status = newStatus
		result.approver = req.user._id  // 記錄是誰做了這次審核操作
		result.comment = req.body.comment || result.comment // 若有新意見則更新，否則保留原本的
		await result.save()

		console.log('LeaveRequest status updated successfully')
		res.status(StatusCodes.OK).json({ result: result })
	} catch (error) {
		console.error('UpdateStatus Error:', error)
		res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '伺服器錯誤: ' + error.message })
	}
}
