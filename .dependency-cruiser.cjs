module.exports = {
  forbidden: [
    { name: 'ui-primitives-have-no-domain-dependencies', severity: 'error', from: { path: '^web/src/components/ui/' }, to: { path: '^web/src/(?!components/ui/|lib/utils\\.ts$)' } },
    { name: 'browser-does-not-import-server', severity: 'error', from: { path: '^web/src/' }, to: { path: '^(api|supabase)/' } },
    { name: 'contracts-do-not-import-apps', severity: 'error', from: { path: '^pkgs/contracts/' }, to: { path: '^(api|web)/' } },
    { name: 'no-circular-dependencies', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules|pkgs/contracts/dist' },
    tsConfig: { fileName: require('node:path').join(__dirname, 'web/tsconfig.app.json') },
    tsPreCompilationDeps: true,
  },
};
