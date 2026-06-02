/**
 * Passport 認證策略設定 (Passport Configuration)
 *
 * 這個檔案設定兩種認證策略，分別用於不同的 API 情境：
 *
 * 1. 'login' 策略（Local Strategy）：
 *    用於 POST /user/login，接收帳號密碼做身份驗證
 *    - 從 DB 查詢帳號是否存在
 *    - 用 bcrypt 比對密碼 hash
 *    - 驗證成功後把 user 物件傳遞給下一個 middleware（controller）
 *
 * 2. 'jwt' 策略（JWT Strategy）：
 *    用於所有需要登入才能存取的 API（透過 Bearer token）
 *    - 從 Authorization 標頭提取 token
 *    - 驗證 token 是否在使用者的 tokens 清單中（防止登出後 token 仍有效）
 *    - 允許 token 過期（ignoreExpiration: true），由此策略自行判斷過期邏輯，
 *      這樣 /user/refresh 和 /user/logout 才能在 token 過期後仍可執行
 *
 * 為什麼 JWT 策略要自行處理過期邏輯（而非讓函式庫自動拒絕）：
 *   如果讓 passport-jwt 在 token 過期時直接拒絕，則 /user/refresh（換新 token）
 *   和 /user/logout（登出）也無法執行，導致用戶體驗變差（無法自動換 token）。
 *   所以設定 ignoreExpiration: true，讓策略自行判斷：
 *   只有在「token 過期 AND 不是 refresh/logout 路徑」時才丟錯誤。
 */

import passport from 'passport'
import passportLocal from 'passport-local'
import passportJWT from 'passport-jwt'
import bcrypt from 'bcrypt'
import User from '../models/user.js'

/**
 * 帳號密碼登入策略 (Local Strategy)
 *
 * 設定欄位名稱對應（前端傳 account 而非預設的 username）
 * 並關閉 session（本專案使用 JWT 無狀態認證，不需要 session）
 */
passport.use(
	'login',
	new passportLocal.Strategy(
		{
			usernameField: 'account',  // 告訴 passport 從 req.body.account 取帳號
			passwordField: 'password', // 從 req.body.password 取密碼
		},
		async (account, password, done) => {
			try {
				// 查詢帳號是否存在；orFail 在找不到時拋出指定錯誤
				const user = await User.findOne({ account }).orFail(new Error('帳號不存在'))

				// 用 bcrypt 比對輸入的明文密碼與 DB 中的 hash
				const match = await bcrypt.compare(password, user.password)

				if (!match) {
					throw new Error('密碼錯誤')
				}

				// 驗證成功，將 user 物件傳給下一個 middleware
				done(null, user)
			} catch (error) {
				// 驗證失敗，將錯誤傳給 middleware 的 auth.login 處理
				done(error)
			}
		},
	),
)

/**
 * JWT 身份驗證策略 (JWT Strategy)
 *
 * 從 HTTP 請求的 Authorization: Bearer <token> 標頭提取 JWT
 * 並驗證 token 的有效性（是否在使用者的 tokens 清單中）
 */
passport.use(
	'jwt',
	new passportJWT.Strategy(
		{
			// 從 Authorization header 的 Bearer 後取得 token
			jwtFromRequest: passportJWT.ExtractJwt.fromAuthHeaderAsBearerToken(),
			// JWT 簽章金鑰，與 login controller 簽發時使用同一個 secret
			secretOrKey: process.env.JWT_SECRET,
			// 將 req 傳入 callback，讓我們可以取得請求路徑（判斷是否為 refresh/logout）
			passReqToCallback: true,
			// 不讓函式庫自動拒絕過期 token，改由我們自行判斷
			// 原因：refresh 和 logout 需要在 token 過期後仍可執行
			ignoreExpiration: true,
		},
		async (req, payload, done) => {
			try {
				// 從 header 再次提取原始 token 字串（用於比對 user.tokens 清單）
				const token = passportJWT.ExtractJwt.fromAuthHeaderAsBearerToken()(req)

				// 判斷 token 是否已過期（payload.exp 單位為秒，Date.now() 為毫秒）
				const expired = payload.exp * 1000 < Date.now()

				// 組合目前的請求路徑
				const url = req.baseUrl + req.path

				// 若 token 過期，且不是 refresh 或 logout 路徑，才拒絕請求
				// refresh 和 logout 允許用過期的 token 執行，以提升使用者體驗
				if (expired && url !== '/user/refresh' && url !== '/user/logout') {
					throw new Error('Token 已過期')
				}

				// 同時驗證：
				// 1. payload._id 的使用者存在
				// 2. token 在該使用者的 tokens 清單中（防止已登出的 token 被重複使用）
				const user = await User.findOne({ _id: payload._id, tokens: token }).orFail(new Error('USER_NOT_FOUND'))

				// 驗證成功，回傳 user 物件和原始 token（logout 時需要 token 來移除）
				done(null, { user, token })
			} catch (error) {
				done(error)
			}
		},
	),
)
