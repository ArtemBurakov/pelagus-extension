import React from "react"
import ArrowRightIcon from "../../../../public/images/_newDesign/ArrowRightIcon"

const TransactionDetails = () => {
  return (
    <>
      <div>
        <h3 className="amount-title">Sending</h3>
        <h1 className="amount">20.012 QI</h1>

        <div className="wallets">
          <div className="wallet">
            <p className="wallet-to-from">From</p>
            <p className="wallet-zone">Wallet 2</p>
            <p className="wallet-payment-code">(0x9238...2344)</p>
          </div>
          <div className="arrow">
            <ArrowRightIcon />
          </div>
          <div className="wallet">
            <p className="wallet-to-from">To</p>
            <p className="wallet-zone">Wallet 1</p>
            <p className="wallet-payment-code">(0x9238...2344)</p>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .amount-title {
            margin: 0;
            text-align: center;
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            color: var(--secondary-text);
          }

          .amount {
            margin: 0;
            font-size: 32px;
            font-weight: 500;
            line-height: 38px;
            text-align: center;
            color: var(--primary-text);
          }

          .wallets {
            display: flex;
            justify-content: center;
            gap: 24px;
            align-items: center;
            margin: 24px 0;
          }

          .wallet {
            display: flex;
            flex-direction: column;
            align-items: center;
            align-content: center;
          }

          .wallet-to-from,
          .wallet-payment-code {
            margin: 0;
            font-weight: 500;
            font-size: 12px;
            line-height: 18px;
            color: var(--secondary-text);
          }

          .wallet-zone {
            margin: 0;
            font-weight: 500;
            font-size: 14px;
            line-height: 20px;
            color: var(--primary-text);
          }

          .arrow {
            padding: 15px 14px;
            border: 1px solid var(--secondary-bg);
            border-radius: 50%;
          }
        `}
      </style>
    </>
  )
}

export default TransactionDetails