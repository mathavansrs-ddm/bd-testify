import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/admin/login'
    }
    return Promise.reject(error)
  }
)

// Admin
export const adminLogin = (data) => api.post('/admin/login', data)
export const getDashboardStats = () => api.get('/admin/dashboard/stats')
export const getAdminSessions = (status) => api.get('/admin/sessions', { params: { status } })
export const getAdminSession = (id) => api.get(`/admin/sessions/${id}`)
export const markSessionReviewed = (id) => api.put(`/admin/sessions/${id}/review`)
export const deleteSession = (id) => api.delete(`/admin/sessions/${id}`)
export const updateSettings = (data) => api.post('/admin/settings', data)

// Questions
export const getQuestions = (testSetId) => api.get('/admin/questions', { params: { test_set_id: testSetId } })
export const createQuestion = (data) => api.post('/admin/questions', data)
export const updateQuestion = (id, data) => api.put(`/admin/questions/${id}`, data)
export const deleteQuestion = (id) => api.delete(`/admin/questions/${id}`)

// Test Sets
export const getTestSets = () => api.get('/admin/test-sets')
export const createTestSet = (data) => api.post('/admin/test-sets', data)
export const updateTestSet = (id, data) => api.put(`/admin/test-sets/${id}`, data)

// Candidates — admin
export const getCandidates = (params) => api.get('/admin/candidates', { params })
export const getCandidate = (id) => api.get(`/admin/candidates/${id}`)
export const addCandidate = (data) => api.post('/admin/candidates', data)
export const bulkUploadCandidates = (formData) => api.post('/admin/candidates/bulk-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const downloadCandidateTemplate = () => api.get('/admin/candidates/template', { responseType: 'blob' })
export const allowReattempt = (id) => api.put(`/admin/candidates/${id}/reattempt`)
export const exportCandidates = () => api.get('/admin/export/candidates', { responseType: 'blob' })
export const exportResults = () => api.get('/admin/export/results', { responseType: 'blob' })

// Invites
export const sendInvite = (data) => api.post('/invite/send', data)
export const bulkSendInvites = (data) => api.post('/invite/bulk-send', data)
export const generateQR = (test_set_id = null, candidate_type = null) => api.post('/invite/qr/generate', null, { params: { ...(test_set_id ? { test_set_id } : {}), ...(candidate_type ? { candidate_type } : {}) } })
export const bulkUploadQuestions = (formData, test_set_id = null) => api.post('/admin/questions/bulk-upload', formData, { params: test_set_id ? { test_set_id } : {} })
export const submitQREmail = (data) => api.post('/invite/qr/submit-email', data)
export const validateToken = (token) => api.get(`/invite/validate/${token}`)
export const getInviteHistory = () => api.get('/invite/history')

// Candidate public
export const registerCandidate = (data) => api.post('/candidate/register', data)
export const registerEmployee = (data) => api.post('/candidate/employee/register', data)
export const employeeLogin = (data) => api.post('/candidate/employee/login', data)
export const getOpenTests = () => api.get('/candidate/open-tests')
export const enrollOpenTest = (testSetId, data) => api.post(`/candidate/open-tests/${testSetId}/enroll`, data)
export const getCandidateProfile = (email) => api.get(`/candidate/profile/${email}`)

// Test
export const startTest = (token) => api.post(`/test/start/${token}`)
export const saveAnswer = (data) => api.post('/test/answer', data)
export const submitTest = (sessionId) => api.post(`/test/submit/${sessionId}`)
export const suspendTest = (sessionId) => api.post(`/test/suspend/${sessionId}`)

// Monitoring
export const logEvent = (data) => api.post('/monitoring/event', data)
export const fraudBlock = (data) => api.post('/monitoring/fraud-block', data)
export const getActiveSessions = (status = null) => api.get('/monitoring/active-sessions', { params: status ? { status } : {} })
export const getFraudLog = (sessionId) => api.get(`/monitoring/fraud-log/${sessionId}`)
export const uploadSnapshot = (data) => api.post('/monitoring/snapshot', data)
export const uploadPhoto = (data) => api.post('/monitoring/photo', data)

// Candidates — admin actions
export const unblockCandidate = (id) => api.put(`/admin/candidates/${id}/unblock`)

export default api
