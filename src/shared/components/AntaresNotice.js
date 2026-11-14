import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

export default function AntaresNotice({
  variant = "info",
  icon = "info",
  children,
  action,
  actionBelow = false,
  className,
}) {
  return (
    <div className={cn("an-notice", variant, actionBelow && "flex-wrap", className)} role="note">
      <span className="an-notice-ico" aria-hidden>
        <span className="material-symbols-outlined">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className={cn("flex items-center gap-2 flex-none", actionBelow && "basis-full justify-end pl-8")}>{action}</div>}
    </div>
  );
}

AntaresNotice.propTypes = {
  variant: PropTypes.oneOf(["info", "warn", "danger"]),
  icon: PropTypes.string,
  children: PropTypes.node,
  action: PropTypes.node,
  actionBelow: PropTypes.bool,
  className: PropTypes.string,
};
