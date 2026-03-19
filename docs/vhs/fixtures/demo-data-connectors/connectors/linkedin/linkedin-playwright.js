const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const demoDelay = process.env.VANA_DEMO_FAST_SUCCESS === "1" ? 1200 : 120;

  await page.setProgress({
    phase: {
      step: 1,
      total: 3,
      label: "Tim Nunamaker \u00B7 Engineer at Vana",
    },
    message: "Fetching profile...",
  });
  await delay(demoDelay);

  await page.setProgress({
    phase: { step: 2, total: 3, label: "6 roles \u00B7 16 skills" },
    message: "Fetching experience...",
  });
  await delay(demoDelay);

  await page.setProgress({
    phase: { step: 3, total: 3, label: "350 connections" },
    message: "Fetching connections...",
  });
  await delay(demoDelay);

  await page.setProgress({
    phase: { step: 3, total: 3, label: "350 connections" },
    message: "complete",
  });
  await delay(200);

  return {
    profile: {
      fullName: "Tim Nunamaker",
      headline: "Engineer at Vana",
      location: "Austin, TX",
    },
    experience: [
      { title: "Engineer", company: "Vana", startDate: "2023" },
      { title: "Software Engineer", company: "Previous Co", startDate: "2021" },
      { title: "Developer", company: "Startup", startDate: "2019" },
      { title: "Junior Engineer", company: "Agency", startDate: "2017" },
      { title: "Intern", company: "Tech Corp", startDate: "2016" },
      { title: "Student", company: "University", startDate: "2014" },
    ],
    skills: [
      "TypeScript",
      "Python",
      "React",
      "Node.js",
      "Data Engineering",
      "Web3",
      "PostgreSQL",
      "Docker",
      "AWS",
      "GraphQL",
      "Rust",
      "Git",
      "CI/CD",
      "System Design",
      "API Design",
      "Testing",
    ],
    connections: Array.from({ length: 350 }, (_, i) => ({
      name: `Connection ${i + 1}`,
    })),
    exportSummary: {
      count: 372,
      label: "items",
      details: "1 profile, 6 experience entries, 16 skills, 350 connections",
    },
  };
})();
