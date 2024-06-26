import React, { ReactElement } from "react"
import SharedButton from "../../components/Shared/SharedButton"
import SharedIcon from "../../components/Shared/SharedIcon"

export default function SettingButton(props: {
  label: string
  ariaLabel: string
  icon: string
  link?: string
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
}): ReactElement {
  const { link, ariaLabel, label, icon, onClick } = props

  return (
    <SharedButton type="unstyled" size="medium" linkTo={link} onClick={onClick}>
      <div className="button_row">
        <div className="action_name">{label}</div>
        <SharedIcon
          icon={`icons/s/${icon}.svg`}
          width={16}
          color="var(--white)"
          ariaLabel={ariaLabel}
        />
        <style jsx>{`
          .action_name {
            color: var(--white);
            font-size: 16px;
            font-weight: 500;
            line-height: 20px;
          }
          .button_row {
            width: 336px;
            align-items: center;
            justify-content: space-between;
            align-content: center;
            display: flex;
          }
          .button_row:hover > .action_name {
            color: var(--green-40);
          }
        `}</style>
      </div>
    </SharedButton>
  )
}
