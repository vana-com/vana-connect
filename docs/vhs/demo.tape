# Hero demo for the README.
# One command. Your data becomes visible.
#
# Render: pnpm demo:vhs
# Or:     HOME="$PWD/docs/vhs/fixtures/demo-home" \
#         VANA_DEMO_FAST_SUCCESS=1 \
#         vhs docs/vhs/demo.tape

Output docs/vhs/demo.gif

Set Shell "bash"
Set FontSize 22
Set Width 900
Set Height 420
Set Framerate 24
Set TypingSpeed 50ms
Set CursorBlink false
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 40
Set Padding 20
Set BorderRadius 10
Set LoopOffset 60%

Type "vana connect linkedin"
Sleep 500ms
Enter
Sleep 8000ms

# Hold on the success so the viewer can read it before the GIF loops.
Sleep 4000ms
