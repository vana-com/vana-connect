Output docs/vhs/data-inspection.svg

Set Shell "bash"
Set FontSize 16
Set Width 1200
Set Height 900
Set TypingSpeed 0ms

Require pnpm

Type "pnpm demo:vhs:fixtures"
Enter
Sleep 800ms

Type "HOME=\"$PWD/docs/vhs/fixtures/demo-home\" node dist/cli/bin.js data list"
Enter
Sleep 1200ms

Type "HOME=\"$PWD/docs/vhs/fixtures/demo-home\" node dist/cli/bin.js data show github"
Enter
Sleep 1200ms
