import { useEffect, useRef, useState, type ElementType } from "react";

/**
 * One line of text that fades out at the end when it's too long for its
 * space, like item card titles. The fade only appears when the text really
 * overflows, so short text is never dimmed. The full text stays available as
 * a tooltip and to screen readers.
 */
export default function FadeText({
  text,
  as: Tag = "span",
  className = "",
}: {
  text: string;
  as?: ElementType;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <Tag ref={ref} className={`fade-text${overflowing ? " fade-text--fade" : ""} ${className}`} title={text}>
      {text}
    </Tag>
  );
}
