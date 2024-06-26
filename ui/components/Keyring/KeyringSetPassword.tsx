import React, { ReactElement, useEffect, useState } from "react"
import { createPassword } from "@pelagus/pelagus-background/redux-slices/keyrings"
import { useHistory } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useBackgroundDispatch, useAreKeyringsUnlocked } from "../../hooks"
import SharedButton from "../Shared/SharedButton"
import SharedBackButton from "../Shared/SharedBackButton"
import PasswordStrengthBar from "../Password/PasswordStrengthBar"
import PasswordInput from "../Shared/PasswordInput"
import { validatePassword } from "../../utils/passwordValidation"

export default function KeyringSetPassword(): ReactElement {
  const { t } = useTranslation("translation", {
    keyPrefix: "keyring.setPassword",
  })
  const [password, setPassword] = useState("")
  const [passwordErrorMessage, setPasswordErrorMessage] = useState("")
  const [passwordConfirmation, setPasswordConfirmation] = useState("")
  const history = useHistory()

  const areKeyringsUnlocked = useAreKeyringsUnlocked(false)

  const dispatch = useBackgroundDispatch()

  useEffect(() => {
    if (areKeyringsUnlocked) {
      history.goBack()
    }
  }, [history, areKeyringsUnlocked])

  const handleInputChange = (
    f: (value: string) => void
  ): ((value: string) => void) => {
    return (value: string) => {
      // If the input field changes, remove the error.
      setPasswordErrorMessage("")
      return f(value)
    }
  }

  const dispatchCreatePassword = (): void => {
    if (
      validatePassword(password, passwordConfirmation, setPasswordErrorMessage)
    ) {
      dispatch(createPassword(password))
    }
  }

  return (
    <section className="standard_width">
      <div className="top">
        <SharedBackButton path="/" />
        <div className="wordmark" />
      </div>
      <h1 className="serif_header">{t("title")}</h1>
      <div className="simple_text subtitle">
        {t("subtitleFirstLine")}
        <br />
        {t("subtitleSecondLine")}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          dispatchCreatePassword()
        }}
      >
        <div className="input_wrap">
          <PasswordInput
            label={t("password")}
            onChange={handleInputChange(setPassword)}
            errorMessage={passwordErrorMessage}
          />
        </div>
        <div className="strength_bar_wrap">
          {!passwordErrorMessage && <PasswordStrengthBar password={password} />}
        </div>
        <div className="input_wrap repeat_password_wrap">
          <PasswordInput
            label={t("repeatPassword")}
            onChange={handleInputChange(setPasswordConfirmation)}
            errorMessage={passwordErrorMessage}
          />
        </div>
        <SharedButton
          type="primary"
          size="large"
          onClick={dispatchCreatePassword}
          showLoadingOnClick={!passwordErrorMessage}
          isFormSubmit
        >
          {t("submitBtn")}
        </SharedButton>
      </form>
      <div className="restore">
        <SharedButton type="tertiary" size="medium">
          {t("restorePassword")}
        </SharedButton>
      </div>
      <style jsx>
        {`
          .top {
            display: flex;
            width: 100%;
          }

          .serif_header {
            text-align: center;
            margin: 40px 30px 7px 30px;
            line-height: 42px;
          }

          .subtitle {
            text-align: center;
            margin: 24px 0 51px 0;
            white-space: pre-line;
          }

          section {
            padding-top: 25px;
            background-color: var(--hunter-green);
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }

          .input_wrap {
            width: 260px;
          }

          .strength_bar_wrap {
            width: 260px;
            height: 26px;
            box-sizing: border-box;
            padding-top: 10px;
          }

          .repeat_password_wrap {
            margin-bottom: 60px;
            margin-top: 27px;
          }

          .restore {
            display: none; // TODO Implement account restoration.
            position: fixed;
            bottom: 26px;
          }
        `}
      </style>
    </section>
  )
}
