import { Component, type ReactNode } from "react";

import { Column } from "@/app/splash";
import { Button } from "@/ui/button";
import { Note } from "@/ui/text";

/** A crash shows what broke and a way back, not a black screen. Stored data is untouched by a reload. */
export class Crash extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Column>
        <Note tone="bad" mono>
          Something broke: {this.state.error.message}
        </Note>
        <Note>Your renders and characters are stored on this device and are not affected.</Note>
        <Button onClick={() => location.reload()}>Reload</Button>
      </Column>
    );
  }
}
