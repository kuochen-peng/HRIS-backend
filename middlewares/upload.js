/**
 * 檔案上傳中間件 (File Upload Middleware)
 *
 * 處理員工請假申請時上傳的附件（診斷書、請假證明等）。
 * 使用 multer（Node.js 最常見的 multipart/form-data 處理函式庫）
 * 搭配 multer-storage-cloudinary，將檔案直接上傳到 Cloudinary 雲端。
 *
 * 流程：
 * 前端送出 multipart/form-data 請求
 *   → multer 解析請求
 *   → fileFilter 過濾不支援的格式
 *   → CloudinaryStorage 上傳至 Cloudinary
 *   → req.file.path 存放 Cloudinary 回傳的公開 URL
 *   → controller 從 req.file.path 取得 URL 存入 DB
 *
 * 為什麼用 Cloudinary 而非本地儲存：
 * 雲端部署環境的本地檔案系統是暫存的，重啟後會消失，
 * Cloudinary 提供持久化儲存與 CDN 加速。
 */

import multer from 'multer'
import cloudinary from '../cloudinary/cloudinary.js'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import { StatusCodes } from 'http-status-codes'

/**
 * multer 設定：
 * - storage：使用 CloudinaryStorage，檔案上傳後直接存到 Cloudinary，
 *            不會在伺服器本地留下暫存檔
 *            resource_type: 'auto' 讓 Cloudinary 自動判斷檔案類型（圖片 / 文件）
 * - limits.fileSize：限制 5MB（5 * 1024 * 1024 bytes），防止大檔案佔用頻寬
 * - fileFilter：白名單過濾，只允許指定的 MIME 類型，
 *              防止上傳可執行檔或其他危險格式
 */
const upload = multer({
	storage: new CloudinaryStorage({
		cloudinary,
		params: {
			resource_type: 'auto', // 自動判斷資源類型（image / raw）
		},
	}),
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB 上限
	},
	fileFilter: (req, file, callback) => {
		// 白名單：只允許圖片（PNG、JPG）與文件（PDF、Word）
		if (
			[
				'image/png',
				'image/jpg',
				'image/jpeg',
				'application/pdf',
				'application/msword',                                                      // .doc
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
			].includes(file.mimetype)
		) {
			// callback(null, true)：允許上傳
			callback(null, true)
		} else {
			// callback(new Error(...), false)：拒絕上傳
			callback(new Error('不支援的文件格式'), false)
		}
	},
})

// 設定為單檔上傳，欄位名稱為 'attachment'（前端 FormData 必須使用同名欄位）
const attachment = upload.single('attachment')

/**
 * 對外匯出的中間件：uploadAttachment
 *
 * 包裝 multer 的 attachment 中間件，統一處理上傳錯誤並回傳友善的錯誤訊息。
 * multer 的錯誤會透過 callback 傳入，而非使用 Express 的 error handler，
 * 所以需要在這裡手動攔截並回應。
 *
 * 錯誤類型：
 * - MulterError.LIMIT_FILE_SIZE    → 檔案太大
 * - MulterError.LIMIT_UNEXPECTED_FILE → 欄位名稱錯誤或檔案數量超過
 * - fileFilter 拋出的 Error        → 不支援的格式
 */
export const uploadAttachment = (req, res, next) => {
	attachment(req, res, (error) => {
		if (error) {
			if (error instanceof multer.MulterError) {
				let message = ''
				if (error.code === 'LIMIT_FILE_SIZE') {
					message = '檔案太大 (限制 1MB)'
				} else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
					message = '檔案欄位錯誤或是數量過多'
				}
				return res.status(StatusCodes.BAD_REQUEST).json({
					message,
					error: error.code,
				})
			}
			// fileFilter 拋出的錯誤（不支援格式）
			return res.status(StatusCodes.BAD_REQUEST).json({
				message: '上傳失敗',
				error: error.message,
			})
		}
		// 沒有錯誤，繼續執行下一個中間件（controller）
		// 此時 req.file 含有 Cloudinary 回傳的資訊，包括 req.file.path（公開 URL）
		next()
	})
}
