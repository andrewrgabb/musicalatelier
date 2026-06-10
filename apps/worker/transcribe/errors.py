"""Shared exception types for the transcription engine."""


class TranscriptionInputError(RuntimeError):
    """The input can't be transcribed (e.g. resolution too low, no staves found).

    This is a *deterministic* failure — retrying the same input won't help — so the
    worker turns it into a BullMQ UnrecoverableError to skip the retry attempts.
    Infrastructure errors (storage/DB/network) raise plain exceptions instead and
    stay retryable.
    """
