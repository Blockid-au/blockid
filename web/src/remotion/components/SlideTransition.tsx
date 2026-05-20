import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface SlideTransitionProps {
  children: React.ReactNode;
  /** Duration of fade-in in frames */
  fadeIn?: number;
  /** Duration of fade-out in frames (counted from end) */
  fadeOut?: number;
  /** Total duration of this slide in frames */
  durationInFrames: number;
  /** Direction of slide: "up", "down", "left", "right", or "none" for fade only */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** Distance to slide in pixels */
  slideDistance?: number;
}

export const SlideTransition: React.FC<SlideTransitionProps> = ({
  children,
  fadeIn = 15,
  fadeOut = 10,
  durationInFrames,
  direction = "up",
  slideDistance = 40,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, fadeIn, durationInFrames - fadeOut, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const slideIn = interpolate(frame, [0, fadeIn], [slideDistance, 0], {
    extrapolateRight: "clamp",
  });

  let transform = "none";
  if (direction === "up") {
    transform = `translateY(${slideIn}px)`;
  } else if (direction === "down") {
    transform = `translateY(${-slideIn}px)`;
  } else if (direction === "left") {
    transform = `translateX(${slideIn}px)`;
  } else if (direction === "right") {
    transform = `translateX(${-slideIn}px)`;
  }

  return (
    <AbsoluteFill style={{ opacity, transform }}>
      {children}
    </AbsoluteFill>
  );
};
