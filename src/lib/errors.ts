import { Data } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
	message: string;
}> {}
export class HttpError extends Data.TaggedError("HttpError")<{
	message: string;
}> {}
