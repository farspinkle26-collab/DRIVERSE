/**
 * Provider marks for the sign-in buttons.
 *
 * Google and Apple both require their own logo on a "Continue with …"
 * button, so these are the one place in the app where a non-palette colour
 * is allowed. Drawn as SVG rather than shipped as PNGs so they stay sharp
 * and carry no asset weight.
 */

import React from "react";
import Svg, { Path } from "react-native-svg";

/** Google "G", in the four brand colours. Fixed hues — do not tint. */
export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <Path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </Svg>
  );
}

/** Apple mark. Monochrome by design — white on our dark surfaces. */
export function AppleMark({ size = 18, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 12.536c-.03-3.017 2.465-4.464 2.576-4.534-1.404-2.054-3.588-2.336-4.366-2.368-1.858-.188-3.626 1.093-4.568 1.093-.943 0-2.394-1.066-3.933-1.037-2.023.03-3.888 1.176-4.929 2.988-2.101 3.65-.537 9.056 1.51 12.02.999 1.45 2.19 3.078 3.756 3.02 1.508-.06 2.078-.976 3.9-.976 1.822 0 2.334.976 3.93.945 1.622-.026 2.65-1.48 3.643-2.934 1.148-1.683 1.622-3.31 1.65-3.394-.036-.015-3.168-1.216-3.2-4.823M14.09 3.633C14.921 2.625 15.48 1.222 15.33 0c-1.201.048-2.656.8-3.515 1.806-.77.892-1.444 2.32-1.264 3.69 1.34.104 2.71-.681 3.539-1.863"
      />
    </Svg>
  );
}
