const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('erp', {
  auth: {
    login: (tenantCode, username, password) => ipcRenderer.invoke('auth:login', { tenantCode, username, password }),
    roles: () => ipcRenderer.invoke('auth:roles'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    changePassword: (newPassword) => ipcRenderer.invoke('auth:changePassword', { newPassword }),
  },
  tenant: {
    current: () => ipcRenderer.invoke('tenant:current'),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (data) => ipcRenderer.invoke('users:create', { data }),
    setActive: (userId, active) => ipcRenderer.invoke('users:setActive', { userId, active }),
    resetPassword: (userId, temporaryPassword) => ipcRenderer.invoke('users:resetPassword', { userId, temporaryPassword }),
  },
  branches: {
    list: () => ipcRenderer.invoke('branches:list'),
  },
  items: {
    list: () => ipcRenderer.invoke('items:list'),
    create: (data) => ipcRenderer.invoke('items:create', { data }),
    update: (id, data) => ipcRenderer.invoke('items:update', { id, data }),
  },
  customers: {
    list: () => ipcRenderer.invoke('customers:list'),
    search: (query) => ipcRenderer.invoke('customers:search', { query }),
    create: (data) => ipcRenderer.invoke('customers:create', { data }),
  },
  rates: {
    latest: () => ipcRenderer.invoke('rates:latest'),
    set: (metal, purity, rate_per_gram) => ipcRenderer.invoke('rates:set', { metal, purity, rate_per_gram }),
  },
  invoices: {
    create: (payload) => ipcRenderer.invoke('invoices:create', payload),
    preview: (payload) => ipcRenderer.invoke('invoices:preview', payload),
    getWithLines: (invoiceId) => ipcRenderer.invoke('invoices:getWithLines', { invoiceId }),
    list: (docType) => ipcRenderer.invoke('invoices:list', { docType }),
  },
  exportTable: (table, format) => ipcRenderer.invoke('export:table', { table, format }),
  manualBackup: (destPath) => ipcRenderer.invoke('backup:manual', { destPath }),
});
