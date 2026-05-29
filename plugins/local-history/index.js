// src/index.ts
async function activate(ctx) {
  console.log("[local-history] Plugin activated");
}
function deactivate() {
  console.log("[local-history] Plugin deactivated");
}
export {
  activate,
  deactivate
};
