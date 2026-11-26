import { createFileRoute } from "@tanstack/react-router";
import { WrappedRoute } from "@/wrapped/formats";
import { wrappedHead } from "@/wrapped/meta";

// Format A: tap-through stories.
export const Route = createFileRoute("/wrapped/$handle")({
  component: () => {
    const { handle } = Route.useParams();
    return <WrappedRoute key={handle} handle={handle} format="stories" />;
  },
  head: ({ params }) => wrappedHead(params.handle),
});
