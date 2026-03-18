/**
 * Final two + variants. Pick one.
 * Usage: node scripts/spinner-demo.mjs
 * Ctrl+C to exit.
 */

const GREEN = "\x1b[38;2;0;213;11m";
const BLUE = "\x1b[38;2;65;65;252m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

const CHECK = `${GREEN}✓${RESET}`;

function style(char, isDim) {
  return isDim ? `${DIM}${BLUE}${char}${RESET}` : `${BLUE}${char}${RESET}`;
}

const spinners = [
  {
    name: "Equal beats + breath (original)",
    frames: [
      { char: "·", duration: 200, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 350, dim: false },
      { char: "✧", duration: 130, dim: false },
      { char: "·", duration: 100, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 350, dim: false },
      { char: "✧", duration: 130, dim: false },
      { char: "·", duration: 400, dim: true },
    ],
  },
  {
    name: "Equal beats + shorter breath",
    frames: [
      { char: "·", duration: 200, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 350, dim: false },
      { char: "✧", duration: 130, dim: false },
      { char: "·", duration: 100, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 350, dim: false },
      { char: "✧", duration: 130, dim: false },
      { char: "·", duration: 250, dim: true },
    ],
  },
  {
    name: "Dark pause (original, 2.5s)",
    frames: [
      { char: " ", duration: 300, dim: true },
      { char: "·", duration: 150, dim: true },
      { char: "✧", duration: 120, dim: false },
      { char: "✦", duration: 200, dim: false },
      { char: "✧", duration: 100, dim: false },
      { char: "·", duration: 80, dim: true },
      { char: "✧", duration: 120, dim: false },
      { char: "✦", duration: 500, dim: false },
      { char: "✧", duration: 120, dim: false },
      { char: "·", duration: 150, dim: true },
      { char: " ", duration: 200, dim: true },
    ],
  },
  {
    name: "Dark pause shorter (2s)",
    frames: [
      { char: " ", duration: 180, dim: true },
      { char: "·", duration: 120, dim: true },
      { char: "✧", duration: 120, dim: false },
      { char: "✦", duration: 200, dim: false },
      { char: "✧", duration: 100, dim: false },
      { char: "·", duration: 80, dim: true },
      { char: "✧", duration: 120, dim: false },
      { char: "✦", duration: 450, dim: false },
      { char: "✧", duration: 120, dim: false },
      { char: "·", duration: 100, dim: true },
      { char: " ", duration: 120, dim: true },
    ],
  },
  {
    name: "Dark pause tight (1.7s)",
    frames: [
      { char: " ", duration: 120, dim: true },
      { char: "·", duration: 100, dim: true },
      { char: "✧", duration: 100, dim: false },
      { char: "✦", duration: 180, dim: false },
      { char: "✧", duration: 80, dim: false },
      { char: "·", duration: 70, dim: true },
      { char: "✧", duration: 100, dim: false },
      { char: "✦", duration: 400, dim: false },
      { char: "✧", duration: 100, dim: false },
      { char: "·", duration: 80, dim: true },
      { char: " ", duration: 80, dim: true },
    ],
  },
  // Hybrid: equal beats structure but with dark pause between cycles
  {
    name: "Equal beats + dark pause (2.2s)",
    frames: [
      { char: " ", duration: 150, dim: true },
      { char: "·", duration: 120, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 320, dim: false },
      { char: "✧", duration: 120, dim: false },
      { char: "·", duration: 90, dim: true },
      { char: "✧", duration: 130, dim: false },
      { char: "✦", duration: 320, dim: false },
      { char: "✧", duration: 120, dim: false },
      { char: "·", duration: 120, dim: true },
      { char: " ", duration: 150, dim: true },
    ],
  },
];

const states = spinners.map(() => ({
  frameIndex: 0,
  frameElapsed: 0,
}));

function render() {
  const lines = [];
  lines.push(
    `${BOLD}Final Two + Variants${RESET} ${DIM}— Ctrl+C to exit${RESET}`,
  );

  for (let i = 0; i < spinners.length; i++) {
    const st = states[i];
    const frame = spinners[i].frames[st.frameIndex];
    const displayChar = frame.char === " " ? " " : style(frame.char, frame.dim);
    const label = `${DIM}${spinners[i].name}${RESET}`;
    lines.push("");
    lines.push(`  ${CHECK} Profile    ${displayChar} Repositories    ${label}`);
  }

  lines.push("");
  return lines.join("\n");
}

const TICK = 15;

function tick() {
  for (let i = 0; i < spinners.length; i++) {
    const st = states[i];
    st.frameElapsed += TICK;
    if (st.frameElapsed >= spinners[i].frames[st.frameIndex].duration) {
      st.frameElapsed = 0;
      st.frameIndex = (st.frameIndex + 1) % spinners[i].frames.length;
    }
  }
}

let lastLineCount = 0;

function draw() {
  if (lastLineCount > 0) {
    process.stdout.write(`\x1b[${lastLineCount}A`);
  }
  const output = render();
  lastLineCount = output.split("\n").length;
  process.stdout.write(output + "\n");
}

draw();

const interval = setInterval(() => {
  tick();
  draw();
}, TICK);

process.on("SIGINT", () => {
  clearInterval(interval);
  process.stdout.write("\n");
  process.exit(0);
});
