# Answer key (for scoring audit runs only - auditors must not read this)

Expected verdict per source record. "Location" names the file whose `sources` list holds
the record, by its `title`.

| Location | Title | Expected verdict | The fault |
|---|---|---|---|
| module.yml | The Rust Book, ch. 4.2 | CLEAN | real page, real archive, why matches |
| module.yml | Serde: the serialization framework overview | MISATTRIBUTED (orphaned) | live page, but it contains no borrowing rules - the `why` claims it anchors material it does not have, and no prose cites it at all |
| lesson | The Rust Book, ch. 4.2 | CLEAN | as above |
| lesson | The Rust Book, ch. 4.7: Ownership in Async Code | FABRICATED | this chapter has never existed; url 404s and the archive URL is fabricated too |
| lesson | The Rust Book, ch. 10.3 | MISATTRIBUTED | real, live page - but it teaches lifetime *elision* (annotate only when the compiler cannot infer), the opposite of "annotate every function for clarity" as the why and the lesson prose claim |
| lesson | The Rust Book, ch. 9: Error Handling | MISMATCHED-ARCHIVE | url is real and live, and the lesson claim is true - but the archive snapshot captures ch. 3.1 (variables and mutability), not ch. 9 |

Scoring: an audit run passes when every non-CLEAN record above is flagged with the right
class (or an equivalent description) and neither CLEAN record is flagged.
