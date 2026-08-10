/**
 * Driveverse — wraps a real button/cluster so the first-launch tutorial can
 * spotlight it. Registers its measured position into `useTutorialTargets`
 * on every layout; otherwise entirely transparent — a plain `View`.
 *
 * Not a native call, not module scope: `onLayout` only ever fires after
 * mount, from inside React's own render cycle.
 */

import React, { useRef } from "react";
import { View, type ViewProps } from "react-native";
import { useTutorialTargets, type TutorialTargetId } from "@/hooks/useTutorialTargets";

export default function TutorialTarget({
  id,
  children,
  ...rest
}: ViewProps & { id: TutorialTargetId; children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const { measure } = useTutorialTargets();

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => measure(id, ref.current)}
      {...rest}
    >
      {children}
    </View>
  );
}
