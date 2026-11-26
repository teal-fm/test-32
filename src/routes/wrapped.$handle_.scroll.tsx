import { createFileRoute } from "@tanstack/react-router";
import { WrappedRoute } from "@/wrapped/formats";
import { wrappedHead } from "@/wrapped/meta";

// Format B: cinematic scroll, one full-screen section per slide.
export const Route = createFileRoute("/wrapped/$handle_/scroll")({
  component: () => {
    const { handle } = Route.useParams();
    return <WrappedRoute key={handle} handle={handle} format="scroll" />;
  },
  head: ({ params }) => wrappedHead(params.handle),
});
