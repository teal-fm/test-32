import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: "description",
        content: "Review your year in music as tracked by teal.fm.",
      },
      {
        title: "teal.fm's Year in Music",
      },
    ],
  }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
