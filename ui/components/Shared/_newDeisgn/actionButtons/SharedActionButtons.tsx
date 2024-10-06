import React from "react"
import SharedCancelButton from "./SharedCancelButton"
import SharedConfirmButton from "./SharedConfirmButton"

const SharedActionButtons = ({
  title = { confirmTitle: "", cancelTitle: "" },
  onClick = { onConfirm: () => {}, onCancel: () => {} },
}: {
  title?: { confirmTitle: string; cancelTitle: string }
  onClick?: { onConfirm: () => void; onCancel: () => void }
}) => {
  return (
    <>
      <div className="action-buttons">
        <SharedCancelButton
          title={title.cancelTitle}
          onClick={onClick.onCancel}
        />
        <SharedConfirmButton
          title={title.confirmTitle}
          onClick={onClick.onConfirm}
        />
      </div>

      <style jsx>{`
        .action-buttons {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          position: absolute;
          bottom: 16px;
          right: 16px;
          left: 16px;
        }
      `}</style>
    </>
  )
}

export default SharedActionButtons