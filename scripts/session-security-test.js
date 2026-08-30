const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const authContext = fs.readFileSync(path.join(root, 'src', 'context', 'AuthContext.jsx'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

assert(preload.includes("logout: () => ipcRenderer.invoke('auth:logout')"), 'preload exposes explicit logout');
assert(preload.includes("changePassword: (newPassword)"), 'password change no longer accepts renderer userId');
assert(!preload.includes('requestingUserId'), 'preload does not expose requestingUserId');
assert(!preload.includes('currentUser.id'), 'preload does not derive authorization from renderer currentUser.id');
assert(main.includes('const rendererSessions = new Map();'), 'main process owns renderer authentication sessions');
assert(main.includes('function getSessionUser(event, options = {})'), 'main process resolves authenticated user from renderer session');
assert(main.includes('rendererSessions.set(event.sender.id, user.id);'), 'successful login binds user to renderer session');
assert(main.includes("ipcMain.handle('auth:logout'"), 'logout clears renderer authentication session');
assert(main.includes("contents.on('destroyed', () => rendererSessions.delete(contents.id))"), 'destroyed renderer session is cleared');
assert(main.includes("getSessionUser(event)"), 'protected IPC handlers use session-derived identity');
assert(authContext.includes('window.erp.auth.changePassword(newPassword)'), 'frontend password change does not send userId');
console.log('PASS: renderer session authorization surface is protected');
