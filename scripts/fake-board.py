"""A stand-in for a board controller, for testing Slackboard's Bluetooth without a board.

Advertises like a Tension controller (name `Tension Fake#<serial>@<api level>`, the board service UUID) and exposes the Nordic
UART write characteristic. Every write is reassembled into the controller's packet stream, checked, and printed as LED positions
and colours, so you can see exactly what a climb sends.

Needs Linux with BlueZ and `pip install bless`. Run: python3 scripts/fake-board.py [serial] [api level]

MoonBoard mode: `python3 scripts/fake-board.py --moonboard [--mini]` advertises as `Moonboard A` and prints the legacy text packet
(`l#S3,P17,E40#`) as grid holes (A1..K18, or K12 on a Mini), decoded with the community reference mapping.
"""
import asyncio
import logging
import sys

from bless import BlessGATTCharacteristic, BlessServer, GATTAttributePermissions, GATTCharacteristicProperties

ADVERTISED = "4488B571-7806-4DF6-BCFF-A2897E4953FF"
NUS = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
RX = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
if "--verbose" in sys.argv:
    # Everything bless and BlueZ report: connections, reads, writes the handler never saw.
    logging.basicConfig(level=logging.DEBUG, format="%(asctime)s %(name)s: %(message)s")
MOON = "--moonboard" in sys.argv
ROWS = 12 if "--mini" in sys.argv else 18
args = [a for a in sys.argv[1:] if not a.startswith("--")]
SERIAL = args[0] if len(args) > 0 else "999001"
API = int(args[1]) if len(args) > 1 else 3

buf = bytearray()
messages = []  # bodies of the messages of the current stream


def describe(body: bytes) -> str:
    cmd = body[0]
    kind = {77: "V2 middle", 78: "V2 first", 79: "V2 last", 80: "V2 only", 81: "V3 middle", 82: "V3 first", 83: "V3 last", 84: "V3 only"}.get(cmd, f"? {cmd}")
    leds = []
    if cmd >= 81:
        for i in range(1, len(body) - 2, 3):
            pos = body[i] | (body[i + 1] << 8)
            c = body[i + 2]
            leds.append((pos, ((c >> 5) & 7) * 36, ((c >> 2) & 7) * 36, (c & 3) * 85))
    else:
        for i in range(1, len(body) - 1, 2):
            pos = body[i] | ((body[i + 1] & 3) << 8)
            b1 = body[i + 1]
            leds.append((pos, ((b1 >> 6) & 3) * 85, ((b1 >> 4) & 3) * 85, ((b1 >> 2) & 3) * 85))
    return f"{kind}: {len(leds)} LEDs " + " ".join(f"{p}:#{r:02X}{g:02X}{b:02X}" for p, r, g, b in leds)


def hole(led: int) -> str:
    """The community decoder (e-sr/moonboard position_trans): the strip runs up column A, down column B, and so on."""
    col, row = led // ROWS, led % ROWS + 1
    if col % 2 == 1:
        row = ROWS + 1 - row
    return "ABCDEFGHIJK"[col] + str(row) if col < 11 else f"?{led}"


text = ""


def feed_moon(data: bytes) -> None:
    """Chunks of `l#...#`: a stream starts at `l#` and ends at the next `#`."""
    global text
    text += data.decode("ascii", "replace")
    while True:
        start = text.find("l#")
        if start < 0:
            text = text[-1:] if text.endswith("l") else ""
            return
        end = text.find("#", start + 2)
        if end < 0:
            text = text[start:]
            return
        body, text = text[start + 2:end], text[end + 1:]
        tokens = [t for t in body.split(",") if t]
        bad = [t for t in tokens if not (t[0] in "SPE" and t[1:].isdigit() and int(t[1:]) < 11 * ROWS)]
        names = {"S": "start", "P": "move", "E": "finish"}
        shown = " ".join(f"{names[t[0]]}:{hole(int(t[1:]))}" for t in tokens if t not in bad)
        print(("ok  " if not bad else "BAD ") + f"{len(tokens)} holds {shown}" + (f"  !! unreadable: {bad}" if bad else "") + ("  (cleared)" if not tokens else ""))


def feed(data: bytes) -> None:
    if MOON:
        feed_moon(data)
        return
    buf.extend(data)
    while True:
        if len(buf) < 5:
            return
        if buf[0] != 1:
            print("!! bad start byte", buf[0]); buf.clear(); return
        n = buf[1]
        total = 4 + n + 1
        if len(buf) < total:
            return
        frame = bytes(buf[:total]); del buf[:total]
        body = frame[4:4 + n]
        ok = frame[3] == 2 and frame[-1] == 3 and frame[2] == (~sum(body) & 255)
        print(("ok  " if ok else "BAD ") + describe(body))
        if not ok:
            print("!! frame failed its checks:", frame.hex(" "))


def on_write(characteristic: BlessGATTCharacteristic, value, **kwargs):
    characteristic.value = value
    print(f"write {len(value)} bytes to {characteristic.uuid}: {bytes(value)!r}")
    feed(bytes(value))


def on_read(characteristic: BlessGATTCharacteristic, **kwargs):
    print(f"read {characteristic.uuid}")
    return characteristic.value


async def main():
    name = "Moonboard A" if MOON else f"Tension Fake#{SERIAL}@{API}"
    server = BlessServer(name=name)
    server.read_request_func = on_read
    server.write_request_func = on_write
    # bless advertises only the FIRST service's UUID, and the app's scan filters on the advertised one: Aurora's own service UUID
    # for the Aurora brands, the Nordic UART service for MoonBoard. So the service the app looks for has to be added first. Both
    # services are still served over GATT after connecting.
    if not MOON:
        # Not empty: BlueZ can drop a service that has no characteristics, and the UART service after it would go missing too.
        await server.add_new_service(ADVERTISED)
        await server.add_new_characteristic(
            ADVERTISED, "4488B571-7806-4DF6-BCFF-A2897E4953F0", GATTCharacteristicProperties.read, b"1", GATTAttributePermissions.readable,
        )
    await server.add_new_service(NUS)
    await server.add_new_characteristic(
        NUS, RX,
        GATTCharacteristicProperties.write | GATTCharacteristicProperties.write_without_response,
        None, GATTAttributePermissions.writeable,
    )
    await server.start()
    print(f"advertising as {name!r}; Ctrl-C to stop")
    while True:
        await asyncio.sleep(3600)


asyncio.run(main())
