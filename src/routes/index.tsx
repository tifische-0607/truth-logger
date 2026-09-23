import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FB Evidence Monitor — evidence capture & chain of custody" },
      {
        name: "description",
        content:
          "Private workspace for collecting Facebook posts and comments as legal evidence for police reports, MCMC complaints and civil actions.",
      },
      { property: "og:title", content: "FB Evidence Monitor" },
      {
        property: "og:description",
        content:
          "Private workspace for collecting Facebook posts and comments as legal evidence with a verifiable chain of custody.",
      },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: () => null,
});
