import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { name: "description", content: "your year in music, as tracked by teal.fm." },
      { title: "teal.fm year in music" },
    ],
  }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
