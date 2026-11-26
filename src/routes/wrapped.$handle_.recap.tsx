import { createFileRoute } from "@tanstack/react-router";
import { WrappedRoute } from "@/wrapped/formats";
import { wrappedHead } from "@/wrapped/meta";

// Format C: stories first, then a full "everything" recap page.
export const Route = createFileRoute("/wrapped/$handle_/recap")({
  component: () => {
    const { handle } = Route.useParams();
    return <WrappedRoute key={handle} handle={handle} format="recap" />;
  },
  head: ({ params }) => wrappedHead(params.handle),
});
