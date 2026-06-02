/**
 * 認證與授權中間件 (Authentication & Authorization Middleware)
 *
 * 提供四個中間件函式，依序疊加在路由上以實現身份驗證與權限控管：
 *
 * 1. login   - 帳號密碼驗證（用於登入 API）
 * 2. token   - JWT token 驗證（用於所有需要登入的 API）
 * 3. admin   - 限制只有 admin 可存取
 * 4. atLeastManager - 限制 admin 或 manager 可存取
 *
 * 設計模式：
 * 所有中間件都採用 Passport 的「自訂 callback」模式（非預設行為），
 * 這讓我們能自行控制錯誤訊息與 HTTP 狀態碼，而不是讓 Passport 重導向或回傳預設錯誤格式。
 *
 * 路由使用範例：
 *   router.get('/secret', auth.token, auth.admin, controller.action)
 *   → 先驗 token → 再驗是否為 admin → 最後執行 controller
 */

import passport from 'passport'
import { StatusCodes } from 'http-status-codes'
import jwt from 'jsonwebtoken'

/**
 * 帳號密碼登入驗證中間件
 *
 * 使用 Passport 的 'login' 策略（passport-local）驗證帳號密碼。
 * 成功後將 user 物件掛在 req.user，讓後續的 login controller 可以取用。
 *
 * 錯誤處理：
 * - 帳號不存在 / 密碼錯誤 / 缺少欄位 → 401 Unauthorized（統一回傳「帳號或密碼錯誤」，避免洩漏哪個欄位錯）
 * - 其他未知錯誤 → 500 Internal Server Error
 */
export const login = (req, res, next) => {
	passport.authenticate('login', { session: false }, (error, user, info) => {
		if (error || !user) {
			// 判斷是已知的驗證錯誤（帳密錯誤）還是未知錯誤
			if (error?.message === '帳號不存在' || error?.message === '密碼錯誤' || info?.message === 'Missing credentials') {
				// 故意不分開說「帳號不存在」或「密碼錯誤」，防止攻擊者探測帳號是否存在
				res.status(StatusCodes.UNAUTHORIZED).json({
					message: '帳號或密碼錯誤',
				})
			} else {
				res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					message: '伺服器錯誤',
				})
			}
		} else {
			// 驗證成功，將 user 掛到 req 上供後續 middleware 使用
			req.user = user
			next()
		}
	})(req, res, next)
}

/**
 * JWT Token 驗證中間件
 *
 * 使用 Passport 的 'jwt' 策略驗證 Authorization header 中的 Bearer token。
 * 成功後將 user 物件與原始 token 分別掛在 req.user 和 req.token：
 * - req.user  → 登入的使用者資料（後續 controller 直接用）
 * - req.token → 原始 token 字串（logout 時需要這個來從清單中移除）
 *
 * 錯誤處理：
 * - token 格式錯誤 / 過期 / 使用者不存在 → 401 Unauthorized
 * - 其他未知錯誤 → 500 Internal Server Error
 */
export const token = (req, res, next) => {
	passport.authenticate('jwt', { session: false }, (error, data, info) => {
		if (error || !data) {
			// JsonWebTokenError：token 格式錯誤、簽章不符
			// EXP：token 已過期（在 passport.js 策略中手動拋出）
			// USER_NOT_FOUND：token 不在使用者的 tokens 清單（已登出）
			if (info instanceof jwt.JsonWebTokenError || error?.message === 'EXP' || error?.message === 'USER_NOT_FOUND') {
				res.status(StatusCodes.UNAUTHORIZED).json({
					message: '身分驗證失敗',
				})
			} else {
				res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					message: '伺服器錯誤',
				})
			}
		} else {
			// 驗證成功，掛載 user 和 token 供後續使用
			req.user = data.user
			req.token = data.token
			next()
		}
	})(req, res, next)
}

/**
 * Admin 權限驗證中間件
 *
 * 必須在 auth.token 之後使用（需要 req.user 存在）。
 * 限制只有 role === 'admin' 的使用者才能繼續。
 *
 * 使用場景：人員管理、新增使用者等管理功能
 */
export const admin = (req, res, next) => {
	if (req.user.role !== 'admin') {
		res.status(StatusCodes.FORBIDDEN).json({
			message: '無權限',
		})
	} else {
		next()
	}
}

/**
 * Manager 以上權限驗證中間件
 *
 * 必須在 auth.token 之後使用。
 * 允許 admin 或 manager 通過，employee 會被阻擋。
 *
 * 使用場景：查看所有員工的請假申請、審核假單
 */
export const atLeastManager = (req, res, next) => {
	if (req.user.role !== 'admin' && req.user.role !== 'manager') {
		res.status(StatusCodes.FORBIDDEN).json({
			message: '無權限',
		})
	} else {
		next()
	}
}
