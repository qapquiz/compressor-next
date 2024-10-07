import * as React from "react"

import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {
		isLoading?: boolean;
	}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, type, ...props }, ref) => {
		return (
			<>
				<label className={cn(
					"flex items-center justify-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
				)}>
					{
						props.isLoading && <Loader2 className="h-4 w-4 animate-spin" />
					}
					<input
						type={type}
						className={cn("bg-background grow", className)}
						// className={cn(
						// 	"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
						// 	className
						// )}
						ref={ref}
						{...props}
					/>
				</label>
			</>
		)
	}
)
Input.displayName = "Input"

export { Input }
