use std::io::{self, Write};

pub(crate) enum CsvCell<'a> {
    Text(&'a str),
    Integer(i64),
    Empty,
}

fn starts_spreadsheet_formula(value: &str) -> bool {
    value
        .bytes()
        .find(|byte| *byte > b' ')
        .is_some_and(|byte| matches!(byte, b'=' | b'+' | b'-' | b'@'))
}

fn write_text_cell<W: Write>(writer: &mut W, value: &str) -> io::Result<()> {
    let neutralize = starts_spreadsheet_formula(value);
    let quote = value
        .bytes()
        .any(|byte| matches!(byte, b',' | b'"' | b'\r' | b'\n'));

    if quote {
        writer.write_all(b"\"")?;
    }
    if neutralize {
        writer.write_all(b"'")?;
    }

    let mut remainder = value.as_bytes();
    while let Some(index) = remainder.iter().position(|byte| *byte == b'"') {
        writer.write_all(&remainder[..index])?;
        writer.write_all(b"\"\"")?;
        remainder = &remainder[index + 1..];
    }
    writer.write_all(remainder)?;

    if quote {
        writer.write_all(b"\"")?;
    }
    Ok(())
}

pub(crate) fn write_csv_row<W: Write>(writer: &mut W, cells: &[CsvCell<'_>]) -> io::Result<()> {
    for (index, cell) in cells.iter().enumerate() {
        if index > 0 {
            writer.write_all(b",")?;
        }
        match cell {
            CsvCell::Text(value) => write_text_cell(writer, value)?,
            CsvCell::Integer(value) => write!(writer, "{value}")?,
            CsvCell::Empty => {}
        }
    }
    writer.write_all(b"\r\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(cells: &[CsvCell<'_>]) -> String {
        let mut output = Vec::new();
        write_csv_row(&mut output, cells).unwrap();
        String::from_utf8(output).unwrap()
    }

    #[test]
    fn encodes_csv_structure_and_formula_like_text() {
        assert_eq!(
            row(&[
                CsvCell::Text("plain"),
                CsvCell::Text("with,comma"),
                CsvCell::Text("with \"quote\""),
                CsvCell::Text("line\r\nbreak"),
            ]),
            "plain,\"with,comma\",\"with \"\"quote\"\"\",\"line\r\nbreak\"\r\n"
        );

        assert_eq!(
            row(&[
                CsvCell::Text("=1+1"),
                CsvCell::Text(" \t+COMMAND"),
                CsvCell::Text("-42"),
                CsvCell::Text("@SUM(A1:A2)"),
                CsvCell::Integer(-42),
            ]),
            "'=1+1,' \t+COMMAND,'-42,'@SUM(A1:A2),-42\r\n"
        );
    }
}
