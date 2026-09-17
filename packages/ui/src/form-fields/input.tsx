/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
// helpers
import { cn } from "../utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mode?: "primary" | "transparent" | "true-transparent";
  inputSize?: "xs" | "sm" | "md";
  hasError?: boolean;
  className?: string;
  /**
   * Most Inputs on this app are plain-data fields (a name, a title, an
   * identifier...) that password managers nonetheless keep flagging as
   * username fields - `autoComplete="off"` alone doesn't stop this, browsers
   * and extensions deliberately ignore it once they've heuristically decided
   * a field looks like a credential. Defaults to true (ignored); set to
   * false for fields that should keep normal autofill, e.g. real auth forms.
   */
  ignorePasswordManagers?: boolean;
}

const Input = React.forwardRef(function Input(props: InputProps, ref: React.ForwardedRef<HTMLInputElement>) {
  const {
    id,
    type,
    name,
    mode = "primary",
    inputSize = "sm",
    hasError = false,
    className = "",
    autoComplete = "off",
    ignorePasswordManagers = true,
    ...rest
  } = props;

  return (
    <input
      id={id}
      ref={ref}
      type={type}
      name={name}
      className={cn(
        "placeholder-tertiary block rounded-md border-subtle-1 bg-layer-2 text-13 focus:outline-none",
        {
          "rounded-md border-[0.5px]": mode === "primary",
          "rounded-sm border-none bg-transparent ring-0 transition-all focus:ring-1 focus:ring-accent-strong":
            mode === "transparent",
          "rounded-sm border-none bg-transparent ring-0": mode === "true-transparent",
          "border-danger-strong": hasError,
          "px-1.5 py-1": inputSize === "xs",
          "px-3 py-2": inputSize === "sm",
          "p-3": inputSize === "md",
        },
        className
      )}
      autoComplete={autoComplete}
      {...(ignorePasswordManagers && {
        "data-1p-ignore": true,
        "data-lpignore": "true",
        "data-bwignore": true,
        "data-form-type": "other",
        "data-protonpass-ignore": true,
      })}
      {...rest}
    />
  );
});

Input.displayName = "form-input-field";

export { Input };
