import React, { CSSProperties } from "react"

const ErrorIcon = ({
  width = 20,
  height = 21,
  fillColor = "#CA4242",
  style = {},
}: {
  width?: number
  height?: number
  fillColor?: string
  style?: CSSProperties
}) => {
  return (
    <div aria-label="error-icon" style={style}>
      <svg
        aria-label="error-icon"
        width={width}
        height={height}
        viewBox="0 0 20 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 1.75C8.26941 1.75 6.57769 2.26318 5.13876 3.22464C3.69983 4.1861 2.57832 5.55267 1.91605 7.15152C1.25378 8.75037 1.0805 10.5097 1.41813 12.207C1.75575 13.9044 2.5891 15.4635 3.81281 16.6872C5.03652 17.9109 6.59562 18.7442 8.29296 19.0819C9.99029 19.4195 11.7496 19.2462 13.3485 18.5839C14.9473 17.9217 16.3139 16.8002 17.2754 15.3612C18.2368 13.9223 18.75 12.2306 18.75 10.5C18.75 8.17936 17.8281 5.95376 16.1872 4.31282C14.5462 2.67187 12.3206 1.75 10 1.75ZM10 18C8.51664 18 7.06659 17.5601 5.83322 16.736C4.59985 15.9119 3.63856 14.7406 3.0709 13.3701C2.50324 11.9997 2.35472 10.4917 2.64411 9.03682C2.9335 7.58197 3.6478 6.24559 4.6967 5.1967C5.74559 4.14781 7.08196 3.4335 8.53682 3.14411C9.99168 2.85472 11.4997 3.00325 12.8701 3.5709C14.2406 4.13856 15.4119 5.09985 16.236 6.33322C17.0601 7.56659 17.5 9.01664 17.5 10.5C17.5 12.4891 16.7098 14.3968 15.3033 15.8033C13.8968 17.2098 11.9891 18 10 18Z"
          fill={fillColor}
        />
        <path
          d="M9.375 5.5H10.625V12.375H9.375V5.5ZM10 14.25C9.81458 14.25 9.63332 14.305 9.47915 14.408C9.32498 14.511 9.20482 14.6574 9.13386 14.8287C9.06291 15 9.04434 15.1885 9.08051 15.3704C9.11669 15.5523 9.20598 15.7193 9.33709 15.8504C9.4682 15.9815 9.63525 16.0708 9.8171 16.107C9.99896 16.1432 10.1875 16.1246 10.3588 16.0536C10.5301 15.9827 10.6765 15.8625 10.7795 15.7083C10.8825 15.5542 10.9375 15.3729 10.9375 15.1875C10.9375 14.9389 10.8387 14.7004 10.6629 14.5246C10.4871 14.3488 10.2486 14.25 10 14.25Z"
          fill={fillColor}
        />
      </svg>
    </div>
  )
}

export default ErrorIcon