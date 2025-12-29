import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Review your year in music as tracked by teal.fm - the best music tracking app.",
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
