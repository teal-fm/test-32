import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
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
});

function Home() {
  const [handle, setHandle] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate({ from: "/" });

  const handleSubmit = (e: React.MouseEvent) => {
    if (!handle.trim()) {
      e.preventDefault();
      setError("please enter a handle");
      setTimeout(() => setError(""), 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (handle.trim()) {
        navigate({
          to: "/wrapped/$handle",
          params: { handle: handle || "futur.blue" },
        });
      } else {
        setError("please enter a handle");
        setTimeout(() => setError(""), 3000);
      }
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated gradient mesh background */}
      <div className="fixed inset-0 bg-[#0a0a0a]">
        <div className="absolute inset-0 opacity-30">
          <div
            className="absolute top-[20%] left-[20%] w-[600px] h-[600px] rounded-full blur-[120px]"
            style={{
              background:
                "radial-gradient(circle, #00d9ff 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute bottom-[20%] right-[20%] w-[500px] h-[500px] rounded-full blur-[120px]"
            style={{
              background:
                "radial-gradient(circle, #ff0099 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[150px]"
            style={{
              background:
                "radial-gradient(circle, #00ffaa 0%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 sm:px-12">
        <div className="max-w-3xl w-full space-y-12">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
            className="space-y-6 text-center"
          >
            <h1 className="text-6xl sm:text-8xl font-semibold">
              teal year in music
            </h1>
            <p className="text-lg sm:text-xl text-white/60 font-light">
              review your year in music, right here.
            </p>
          </motion.div>

          {/* Single bar input + button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
            className="flex flex-col sm:flex-row gap-3 sm:gap-0"
          >
            {/* Input container */}
            <motion.div
              animate={
                isFocused
                  ? {
                      background: "rgba(255, 255, 255, 0.12)",
                      boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
                      scale: 1.01,
                    }
                  : {
                      background: "rgba(255, 255, 255, 0.08)",
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                    }
              }
              whileHover={{
                background: "rgba(255, 255, 255, 0.12)",
                boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
              }}
              className="flex-1 rounded-full sm:rounded-r-none backdrop-blur-xl flex items-center px-6 sm:pl-8 sm:pr-4 py-4 sm:py-2"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
              }}
            >
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                placeholder="username.bsky.social"
                className="flex-1 bg-transparent border-none outline-none text-white text-base sm:text-lg placeholder:text-white/30 w-full"
              />
            </motion.div>

            {/* Button */}
            <Link
              to="/wrapped/$handle"
              params={{ handle: handle || "futur.blue" }}
              onClick={handleSubmit}
              className="group relative px-8 py-4 sm:py-3 bg-neutral-700/80 sm:bg-neutral-700/80 rounded-full sm:rounded-l-none font-medium text-base text-white/60 overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:bg-neutral-600/80 text-center border border-white/12 sm:border-l-0"
              style={{
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
              }}
            >
              <span className="relative z-10">view your year</span>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
          </motion.div>

          {/* Error message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-red-400 text-sm"
            >
              {error}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
