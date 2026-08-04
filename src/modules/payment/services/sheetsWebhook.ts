/**
 * @deprecated Direct Sheets calls from the Payment Module are forbidden.
 * Path: PaymentRepository → EventBus → SyncManager → GoogleSheetsSyncProvider.
 */
export { postToGoogleSheets } from "@/googleSheets/GoogleSheetsClient"
