import { HeadContent, Outlet, createRootRoute } from "@tanstack/react-router";
export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: "description",
        content:
          "Review your year in music as tracked by Teal.fm - the best music tracking app.",
      },
      {
        title: "Teal.fm's Year in Music",
      },
    ],
  }),
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  ),
});
