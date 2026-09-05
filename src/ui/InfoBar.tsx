import {
  CheckmarkCircle20Regular,
  ErrorCircle20Regular,
  Info20Regular,
  Warning20Regular,
} from '@fluentui/react-icons';
import type { ReactNode } from 'react';

/**
 * An inline message about the state of something.
 *
 * Severity is carried by colour **and** an icon **and** the wording — never by
 * colour alone, which would be invisible to a large share of users.
 */

export type Severity = 'info' | 'success' | 'caution' | 'danger';

const STYLE: Record<Severity, { surface: string; icon: ReactNode }> = {
  info: { surface: 'bg-info-subtle border-info/30', icon: <Info20Regular className="text-info" /> },
  success: {
    surface: 'bg-success-subtle border-success/30',
    icon: <CheckmarkCircle20Regular className="text-success" />,
  },
  caution: {
    surface: 'bg-caution-subtle border-caution/30',
    icon: <Warning20Regular className="text-caution" />,
  },
  danger: {
    surface: 'bg-danger-subtle border-danger/30',
    icon: <ErrorCircle20Regular className="text-danger" />,
  },
};

export function InfoBar({
  severity = 'info',
  title,
  children,
}: {
  severity?: Severity;
  title: string;
  children?: ReactNode;
}) {
  const { surface, icon } = STYLE[severity];
  return (
    <div role="status" className={`flex gap-3 rounded-lg border p-3 ${surface}`}>
      <span aria-hidden="true" className="mt-px shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-body font-semibold text-fg">{title}</p>
        {children && <div className="mt-1 text-body text-fg-secondary">{children}</div>}
      </div>
    </div>
  );
}
