from dataclasses import dataclass


@dataclass(frozen=True)
class ParkingRowConfig:
    section: str
    row: str
    capacity: int


PARKING_ROWS: tuple[ParkingRowConfig, ...] = (
    ParkingRowConfig("A", "A", 40),
    ParkingRowConfig("A", "B", 42),
    ParkingRowConfig("A", "C", 42),
    ParkingRowConfig("A", "D", 44),
    ParkingRowConfig("A", "E", 44),
    ParkingRowConfig("A", "F", 45),
    ParkingRowConfig("B", "G", 48),
    ParkingRowConfig("B", "H", 48),
    ParkingRowConfig("B", "I", 48),
    ParkingRowConfig("B", "J", 48),
    ParkingRowConfig("B", "K", 48),
    ParkingRowConfig("B", "L", 48),
    ParkingRowConfig("B", "M", 48),
    ParkingRowConfig("B", "N", 48),
    ParkingRowConfig("B", "O", 48),
    ParkingRowConfig("B", "P", 48),
    ParkingRowConfig("B", "Q", 50),
    ParkingRowConfig("C", "R", 45),
    ParkingRowConfig("C", "S", 45),
    ParkingRowConfig("C", "T", 48),
    ParkingRowConfig("C", "U", 48),
    ParkingRowConfig("C", "V", 48),
    ParkingRowConfig("C", "W", 48),
    ParkingRowConfig("C", "X", 50),
)


SECTION_BEHAVIOUR = {
    "A": {"arrival_multiplier": 1.20, "departure_multiplier": 0.92},
    "B": {"arrival_multiplier": 1.00, "departure_multiplier": 1.00},
    "C": {"arrival_multiplier": 0.82, "departure_multiplier": 1.08},
}
