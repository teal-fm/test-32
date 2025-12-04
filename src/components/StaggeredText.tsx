'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type StaggeredToken =
  | string
  | React.ReactNode
  | {
      element: string | React.ReactNode;
      delay?: number;
    };

interface StaggeredTextProps {
  text: StaggeredToken[] | string;
  className?: string;
  offset?: number;
  delay?: number;
  duration?: number;
  staggerDelay?: number;
  once?: boolean;
  as?: React.ElementType;
}

interface NormalizedToken {
  element: React.ReactNode;
  delay?: number;
  isWhitespace?: boolean;
}

export default function StaggeredText({
  text,
  className = '',
  offset: propOffset,
  delay = 0,
  duration = 0.1,
  staggerDelay = 0.1,
  once = false,
  as: Component = 'div',
}: StaggeredTextProps) {
  if (typeof text === 'string') text = [text];
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<number>(propOffset ?? 20);

  useEffect(() => {
    if (propOffset === undefined && ref.current) {
      const computed = window.getComputedStyle(ref.current);
      const lineHeight = computed.lineHeight;

      if (lineHeight === 'normal') {
        const fontSize = parseFloat(computed.fontSize || '16');
        setOffset(fontSize * 1.2);
      } else {
        setOffset(parseFloat(lineHeight));
      }
    }
  }, [propOffset]);

  const normalizeTokens = (input: StaggeredToken[]): NormalizedToken[] => {
    const result: NormalizedToken[] = [];

    input.forEach((item) => {
      if (typeof item === 'string') {
        const parts = item.split(/(\s+)/g).filter((w) => w.length > 0);
        parts.forEach((word) =>
          result.push({
            element: word,
            isWhitespace: /\s+/.test(word),
          })
        );
      } else if (
        typeof item === 'object' &&
        item !== null &&
        'element' in item
      ) {
        result.push({
          element: item.element,
          delay: item.delay,
        });
      } else {
        result.push({ element: item });
      }
    });

    return result;
  };

  const tokens = normalizeTokens(text);

  let accumulatedDelay = delay;
  const tokenDelays = tokens.map((token) => {
    const thisDelay = accumulatedDelay;
    accumulatedDelay += staggerDelay;
    if (token.delay !== undefined) {
      accumulatedDelay += token.delay;
    }
    return thisDelay;
  });

  return (
    <Component className={className} ref={ref}>
      <span style={{ display: 'inline-block', whiteSpace: 'pre-wrap' }}>
        {tokens.map((token, index) => {
          if (token.isWhitespace) {
            return <span key={`space-${index}`}>{token.element}</span>;
          }

          return (
            <motion.span
              key={`token-${index}`}
              style={{ display: 'inline-block' }}
              initial={{ opacity: 0, y: offset }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration,
                delay: tokenDelays[index],
                type: 'tween',
              }}
              viewport={{ once }}
              className="origin-bottom"
            >
              {token.element}
            </motion.span>
          );
        })}
      </span>
    </Component>
  );
}
