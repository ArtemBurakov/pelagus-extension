import { setSnackbarMessage } from "@pelagus/pelagus-background/redux-slices/ui"
import React, { ReactElement } from "react"
import { useTranslation } from "react-i18next"
import SharedButton from "../../../../components/Shared/SharedButton"
import { useBackgroundDispatch } from "../../../../hooks"
import { clearClipboard } from "../../../../utils/textUtils"
import SharedBanner from "../../../../components/Shared/SharedBanner"
import { CLEAR_RECOVERY_PHRASE_TIMEOUT } from "../../../../utils/constants"

export default function NewSeedReview({
  onReview,
  mnemonic,
}: {
  mnemonic: string[]
  onReview: () => void
}): ReactElement {
  const { t } = useTranslation("translation", {
    keyPrefix: "onboarding.tabbed.newWalletReview",
  })
  const { t: sharedT } = useTranslation("translation", {
    keyPrefix: "shared",
  })
  const dispatch = useBackgroundDispatch()

  const onCopyMnemonic = async () => {
    await navigator.clipboard.writeText(mnemonic?.join(" ") ?? "")
    dispatch(setSnackbarMessage(sharedT("copyTextSnackbar")))
    window.addEventListener("beforeunload", () => clearClipboard())

    setTimeout(async () => {
      await clearClipboard()
      window.removeEventListener("beforeunload", () => clearClipboard())
    }, CLEAR_RECOVERY_PHRASE_TIMEOUT)
  }

  return (
    <section className="fadeIn">
      <h1 className="center_text">{t("title")}</h1>
      <div className="step_content">
        <div className="seed_phrase">
          {mnemonic.map((word, i) => {
            const key = `${word}-${i}`
            return (
              <div className="word" key={key}>
                <i>-</i>
                {word}
              </div>
            )
          })}
        </div>
        <SharedButton type="primary" size="medium" onClick={onReview} center>
          {t("submit")}
        </SharedButton>
        <SharedBanner
          icon="notif-attention"
          iconColor="var(--error-80)"
          customStyles="background: var(--error); width: 100%; box-sizing: border-box;"
        >
          <span className="warning_message">
            {t("copyRecoveryPhraseWarning")}
          </span>
        </SharedBanner>
        <div className="copy_phrase">
          <SharedButton
            type="tertiary"
            size="small"
            iconMedium="copy"
            onClick={onCopyMnemonic}
            center
          >
            {t("copyAddressAction")}
          </SharedButton>
        </div>
      </div>
      <style jsx>{`
        section {
          max-width: 450px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .step_content {
          max-width: 430px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          justify-content: stretch;
        }

        h1 {
          font-family: "TT Travels";
          font-style: normal;
          font-weight: 500;
          font-size: 36px;
          line-height: 42px;
          color: var(--hunter-green);
          text-align: center;
          margin-bottom: 27px;
          margin-top: 24px;
        }
        .seed_phrase {
          display: grid;
          grid: repeat(8, 1fr) / auto-flow 1fr;
          place-content: center;
          counter-reset: step;
          gap: 16px 24px;
          padding: 16px;
          background: var(--green-95);
          border-radius: 8px;
        }

        .word::before {
          width: 20px;
          text-align: right;
          content: counter(step);
          counter-increment: step;
        }

        .word {
          color: var(--green-20);
          display: flex;
          gap: 8px;
          font-family: "Segment";
          font-style: normal;
          font-weight: 600;
          font-size: 18px;
          line-height: 27px;
        }

        .word i {
          user-select: none;
        }

        .copy_phrase {
          align-items: center;
          display: flex;
          flex-direction: column;
        }

        .warning_message {
          font-size: 14px;
          line-height: 18px;
          font-weight: 500;
        }
      `}</style>
    </section>
  )
}
