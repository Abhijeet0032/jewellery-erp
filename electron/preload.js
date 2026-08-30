const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erp', {
  auth: {
    login: (tenantCode, username, password) => ipcRenderer.invoke('auth:login', { tenantCode, username, password }),
    roles: () => ipcRenderer.invoke('auth:roles'),
    changePassword: (userId, newPassword) => ipcRenderer.invoke('auth:changePassword', { userId, newPassword }),
  },
  tenant: {
    current: (userId) => ipcRenderer.invoke('tenant:current', { userId }),
  },
  users: {
    list: (requestingUserId) => ipcRenderer.invoke('users:list', { requestingUserId }),
    create: (data, requestingUserId) => ipcRenderer.invoke('users:create', { data, requestingUserId }),
    setActive: (userId, active, requestingUserId) => ipcRenderer.invoke('users:setActive', { userId, active, requestingUserId }),
    resetPassword: (userId, temporaryPassword, requestingUserId) => ipcRenderer.invoke('users:resetPassword', { userId, temporaryPassword, requestingUserId }),
  },
  branches: {
    list: (userId) => ipcRenderer.invoke('branches:list', { userId }),
  },
  items: {
    list: (userId) => ipcRenderer.invoke('items:list', { userId }),
    create: (data, userId) => ipcRenderer.invoke('items:create', { data, userId }),
    update: (id, data, userId) => ipcRenderer.invoke('items:update', { id, data, userId }),
  },
  customers: {
    list: (userId) => ipcRenderer.invoke('customers:list', { userId }),
    search: (query, userId) => ipcRenderer.invoke('customers:search', { query, userId }),
    create: (data, userId) => ipcRenderer.invoke('customers:create', { data, userId }),
  },
  rates: {
    latest: (userId) => ipcRenderer.invoke('rates:latest', { userId }),
    set: (metal, purity, rate_per_gram, userId) => ipcRenderer.invoke('rates:set', { metal, purity, rate_per_gram, userId }),
  },
  invoices: {
    create: (payload) => ipcRenderer.invoke('invoices:create', payload),
    preview: (payload) => ipcRenderer.invoke('invoices:preview', payload),
    getWithLines: (invoiceId, userId) => ipcRenderer.invoke('invoices:getWithLines', { invoiceId, userId }),
    list: (docType, userId) => ipcRenderer.invoke('invoices:list', { docType, userId }),
  },
  exportTable: (table, format, userId) => ipcRenderer.invoke('export:table', { table, format, userId }),
  manualBackup: (destPath, userId) => ipcRenderer.invoke('backup:manual', { destPath, userId }),
});
