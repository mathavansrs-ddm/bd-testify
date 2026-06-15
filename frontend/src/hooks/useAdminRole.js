export function useAdminRole() {
  const role = localStorage.getItem('admin_role') || 'superadmin'
  const name = localStorage.getItem('admin_name') || ''
  return {
    role,
    name,
    isSuperAdmin: role === 'superadmin',
    isMaster: role === 'master',
  }
}
