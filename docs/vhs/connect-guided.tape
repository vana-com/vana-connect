Output docs/vhs/connect-guided.svg

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 900
Set TypingSpeed 0ms

Require pnpm

Type "pnpm demo:vhs:fixtures"
Enter
Sleep 800ms

Type "HOME=\"$PWD/docs/vhs/fixtures/demo-home\" node dist/cli/bin.js connect steam --no-input"
Enter
Sleep 1200ms

Type "HOME=\"$PWD/docs/vhs/fixtures/demo-home\" node dist/cli/bin.js connect"
Enter
Sleep 1200ms
