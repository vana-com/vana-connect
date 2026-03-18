# Hero demo for the README.
# Shows the core workflow: connect a source, then inspect the collected data.
#
# Render with the existing infrastructure:
#   pnpm demo:vhs
#
# Or manually (requires seeded fixture HOME):
#   HOME="$PWD/docs/vhs/fixtures/demo-home" \
#   VANA_DEMO_FAST_SUCCESS=1 \
#   vhs docs/vhs/demo.tape

Output docs/assets/demo.gif

Set Shell "bash"
Set FontSize 22
Set Width 1200
Set Height 800
Set Framerate 24
Set TypingSpeed 50ms
Set CursorBlink false
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful
Set WindowBarSize 40
Set Padding 20
Set BorderRadius 10

# Connect GitHub. Output streams over ~5-6s from the fixture connector.
Type "vana connect github"
Sleep 500ms
Enter
Sleep 7000ms

# Let the viewer read the success message and path.
Sleep 2000ms

# Inspect what was collected.
Type "vana data show github"
Sleep 500ms
Enter
Sleep 3000ms

# Hold on the summary so the viewer can read it before the GIF loops.
Sleep 4000ms
