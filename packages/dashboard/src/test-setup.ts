import '@testing-library/jest-dom'
import { initI18n } from './i18n/index.js'

// Initialize i18n in English before each test file so useTranslation() works.
// This is a module-level call that runs once per test file.
await initI18n('en')
